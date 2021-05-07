// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const stream = require('stream');

const db = require('../util/db');
const { tokenize, stripUnsafeTokens } = require('../util/tokenize');

function createMany(client, examples, updateExisting) {
    if (examples.length === 0)
        return Promise.resolve();

    const KEYS = ['id', 'schema_id', 'is_base', 'flags', 'language', 'utterance', 'preprocessed',
                  'target_json', 'target_code', 'context',
                  'type', 'click_count', 'like_count', 'owner', 'name'];
    const arrays = [];
    examples.forEach((ex) => {
        if (!ex.type)
            ex.type = 'thingpedia';
        if (ex.click_count === undefined)
            ex.click_count = 1;
        ex.like_count = 0;
        KEYS.forEach((key) => {
            if (ex[key] === undefined)
                ex[key] = null;
        });
        const vals = KEYS.map((key) => {
            return ex[key];
        });
        arrays.push(vals);
    });


    if (updateExisting) {
        return db.insertOne(client, 'insert into example_utterances(' + KEYS.join(',') + ') '
                            + `values ? on duplicate key update
                               utterance=values(utterance), preprocessed=values(preprocessed), context=values(context),
                               target_code=values(target_code), type=values(type), flags=values(flags), is_base=values(is_base)`,
                               [arrays]);
    } else {
        return db.insertOne(client, 'insert into example_utterances(' + KEYS.join(',') + ') '
                            + 'values ?', [arrays]);
    }
}

function create(client, ex, updateExisting) {
    if (!ex.type)
        ex.type = 'thingpedia';
    if (ex.click_count === undefined)
        ex.click_count = 1;

    if (updateExisting) {
        return db.insertOne(client, `insert into example_utterances set ? on duplicate key update
                                     utterance=values(utterance), preprocessed=values(preprocessed), context=values(context),
                                     target_code=values(target_code), type=values(type), flags=values(flags), is_base=values(is_base)`,
                                     [ex]);
    } else {
        return db.insertOne(client, 'insert into example_utterances set ?', [ex]);
    }
}

module.exports = {
    getAll(client) {
        console.error('example.getAll called, where is this from?');
        return db.selectAll(client, "select * from example_utterances");
    },

    // The ForUser variants of getCommands and getCommandsByFuzzySearch
    // return an additional column, "liked", which is a boolean indicating
    // whether the named user liked the given command or not
    // They are used to color the hearts in Commandpedia, if the user is logged in
    getCommandsForUser(client, language, userId, start, end) {
        const query = `
            (select eu.id,eu.language,eu.type,eu.utterance,
             eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,null as kind,u.username as owner_name,
             (exists (select 1 from example_likes where example_id = eu.id and user_id = ?)) as liked
             from example_utterances eu left join users u on u.id = eu.owner where
             type = 'commandpedia' and language = ? and not find_in_set('replaced', flags)
             and not find_in_set('augmented', flags)
            ) union all (
             select eu.id,eu.language,eu.type,eu.utterance,
             eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,ds.kind,org.name as owner_name,
             (exists (select 1 from example_likes where example_id = eu.id and user_id = ?)) as liked
             from (example_utterances eu, device_schema ds) left join organizations org on org.id = ds.owner
             where ds.id = eu.schema_id and type = 'thingpedia' and language = ? and ds.approved_version is not null
             and is_base
            ) order by like_count desc,click_count desc,md5(utterance) asc`;

        if (start !== undefined && end !== undefined)
            return db.selectAll(client, `${query} limit ?,?`, [userId, language, userId, language, start, end + 1]);
        else
            return db.selectAll(client, query, [userId, language, userId, language]);
    },

    getCommandsByFuzzySearchForUser(client, language, userId, query) {
        const regexp = '(^| )(' + stripUnsafeTokens(tokenize(query)).join('|') + ')( |$)';
        return db.selectAll(client, `
            (select eu.id,eu.language,eu.type,eu.utterance,
             eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,null as kind,u.username as owner_name,
             (exists (select 1 from example_likes where example_id = eu.id and user_id = ?)) as liked
             from example_utterances eu left join users u on u.id = eu.owner where
             type = 'commandpedia' and language = ? and not find_in_set('replaced', flags)
             and not find_in_set('augmented', flags) and ( utterance like ? or target_code like ?)
            ) union all (
             select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
             eu.target_code,eu.click_count,eu.like_count,eu.is_base,ds.kind,org.name as owner_name,
             (exists (select 1 from example_likes where example_id = eu.id and user_id = ?)) as liked
             from (example_utterances eu, device_schema ds) left join organizations org on org.id = ds.owner
             where eu.schema_id = ds.id and eu.is_base = 1 and eu.type = 'thingpedia' and language = ?
             and preprocessed rlike (?) and target_code <> ''
            ) union distinct (
             select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
             eu.target_code,eu.click_count,eu.like_count,eu.is_base,ds.kind,org.name as owner_name,
             (exists (select 1 from example_likes where example_id = eu.id and user_id = ?)) as liked
             from (example_utterances eu, device_schema ds) left join organizations org on org.id = ds.owner
             where eu.schema_id = ds.id and eu.is_base = 1 and eu.type = 'thingpedia' and language = ?
             and match kind_canonical against (?) and target_code <> ''
            ) order by like_count desc,click_count desc,md5(utterance) asc`, [userId, language, `%${query}%`, `%${query}%`,
                userId, language, regexp, userId, language, query]);
    },

    getCommands(client, language, start, end) {
        const query = `
            (select eu.id,eu.language,eu.type,eu.utterance,
             eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,null as kind,u.username as owner_name
             from example_utterances eu left join users u on u.id = eu.owner where
             type = 'commandpedia' and language = ? and not find_in_set('replaced', flags)
             and not find_in_set('augmented', flags)
            ) union all (
             select eu.id,eu.language,eu.type,eu.utterance,
             eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,ds.kind,org.name as owner_name
             from (example_utterances eu, device_schema ds) left join organizations org on org.id = ds.owner
             where ds.id = eu.schema_id and type = 'thingpedia' and language = ? and ds.approved_version is not null
             and is_base
            ) order by like_count desc,click_count desc,md5(utterance) asc`;

        if (start !== undefined && end !== undefined)
            return db.selectAll(client, `${query} limit ?,?`, [language, language, start, end + 1]);
        else
            return db.selectAll(client, query, [language, language]);
    },

    getCommandsByFuzzySearch(client, language, query) {
        const regexp = '(^| )(' + stripUnsafeTokens(tokenize(query)).join('|') + ')( |$)';
        return db.selectAll(client, `
            (select eu.id,eu.language,eu.type,eu.utterance,
             eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,null as kind,u.username as owner_name
             from example_utterances eu left join users u on u.id = eu.owner where
             type = 'commandpedia' and language = ? and not find_in_set('replaced', flags)
             and not find_in_set('augmented', flags) and ( utterance like ? or target_code like ?)
            ) union all (
             select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
             eu.target_code,eu.click_count,eu.like_count,eu.is_base,ds.kind,org.name as owner_name
             from (example_utterances eu, device_schema ds) left join organizations org on org.id = ds.owner
             where eu.schema_id = ds.id and eu.is_base = 1 and eu.type = 'thingpedia' and language = ?
             and preprocessed rlike (?) and target_code <> ''
            ) union distinct (
             select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
             eu.target_code,eu.click_count,eu.like_count,eu.is_base,ds.kind,org.name as owner_name
             from (example_utterances eu, device_schema ds) left join organizations org on org.id = ds.owner
             where eu.schema_id = ds.id and eu.is_base = 1 and eu.type = 'thingpedia' and language = ?
             and match kind_canonical against (?) and target_code <> ''
            ) order by like_count desc,click_count desc,md5(utterance) asc`, [language, `%${query}%`, `%${query}%`, language, regexp, language, query]);
    },

    getCheatsheet(client, language) {
        return db.selectAll(client, `select eu.id,eu.utterance,eu.target_code,ds.kind
            from example_utterances eu, device_schema ds where eu.schema_id = ds.id and
            eu.is_base = 1 and eu.type = 'thingpedia' and language = ? and ds.approved_version is not null
            order by click_count desc, id asc`,
            [language]);
    },
    getBaseByLanguage(client, org, language) {
        if (org === -1) { // admin
            return db.selectAll(client, `select eu.id,eu.utterance,eu.preprocessed,eu.target_code,
                eu.click_count,eu.like_count,eu.name from example_utterances eu
                where eu.is_base = 1 and eu.type = 'thingpedia' and not find_in_set('synthetic', flags) and language = ?
                order by id asc`,
                [language]);
        } else if (org !== null) {
            return db.selectAll(client, `select eu.id,eu.utterance,eu.preprocessed,eu.target_code,
                eu.click_count,eu.like_count,eu.name from example_utterances eu, device_schema ds
                where eu.schema_id = ds.id and
                eu.is_base = 1 and eu.type = 'thingpedia' and not find_in_set('synthetic', flags) and language = ?
                and (ds.approved_version is not null or ds.owner = ?)
                order by id asc`,
                [language, org]);
        } else {
            return db.selectAll(client, `select eu.id,eu.utterance,eu.preprocessed,eu.target_code,
                eu.click_count,eu.like_count,eu.name from example_utterances eu, device_schema ds
                where eu.schema_id = ds.id and eu.is_base = 1 and eu.type = 'thingpedia' and
                not find_in_set('synthetic', flags) and language = ? and ds.approved_version is not null
                order by id asc`,
                [language]);
        }
    },

    getByKey(client, key, org, language) {
        const regexp = '(^| )(' + stripUnsafeTokens(tokenize(key)).join('|') + ')( |$)';
        if (org === -1) { // admin
            return db.selectAll(client,
              `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and not find_in_set('synthetic', flags) and language = ?
                and preprocessed rlike (?) and target_code <> '')
               union distinct
               (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and not find_in_set('synthetic', flags) and language = ?
                and match kind_canonical against (?) and target_code <> '')
                order by id asc
               limit 50`,
            [language, regexp, language, key]);
        } else if (org !== null) {
            return db.selectAll(client,
              `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and not find_in_set('synthetic', flags) and language = ?
                and preprocessed rlike (?) and target_code <> ''
                and (ds.approved_version is not null or ds.owner = ?))
               union distinct
               (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and not find_in_set('synthetic', flags) and language = ?
                and match kind_canonical against (?) and target_code <> ''
                and (ds.approved_version is not null or ds.owner = ?))
                order by id asc
               limit 50`,
            [language, regexp, org, language, key, org]);
        } else {
            return db.selectAll(client,
              `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and not find_in_set('synthetic', flags) and language = ?
                and preprocessed rlike (?) and target_code <> ''
                and ds.approved_version is not null)
               union distinct
               (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and not find_in_set('synthetic', flags) and language = ?
                and match kind_canonical against (?) and target_code <> ''
                and ds.approved_version is not null)
                order by id asc
               limit 50`,
            [language, regexp, language, key]);
        }
    },

    getByKinds(client, kinds, org, language, includeSynthetic) {
        if (org === -1) { // admin
            return db.selectAll(client,
                `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                  eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                  device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                  and eu.type = 'thingpedia' ${includeSynthetic ? '' : 'and not find_in_set(\'synthetic\', flags)'} and language = ?
                  and ds.kind in (?) and target_code <> '')
                union distinct
                (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                 eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                 device_schema ds, device_class dc, device_class_kind dck where
                 eu.schema_id = ds.id and ds.kind = dck.kind and dck.device_id = dc.id
                 and not dck.is_child and dc.primary_kind in (?) ${includeSynthetic ? '' : 'and not find_in_set(\'synthetic\', flags)'} and language = ?
                 and target_code <> '' and eu.type = 'thingpedia' and eu.is_base = 1)
                 order by id asc`,
                [language, kinds, kinds, language]);
        } else if (org !== null) {
            return db.selectAll(client,
                `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                  eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                  device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                  and eu.type = 'thingpedia' ${includeSynthetic ? '' : 'and not find_in_set(\'synthetic\', flags)'} and language = ?
                  and ds.kind in (?) and target_code <> ''
                  and (ds.approved_version is not null or ds.owner = ?))
                union distinct
                (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                 eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                 device_schema ds, device_class dc, device_class_kind dck where
                 eu.schema_id = ds.id and ds.kind = dck.kind and dck.device_id = dc.id
                 and not dck.is_child and dc.primary_kind in (?) ${includeSynthetic ? '' : 'and not find_in_set(\'synthetic\', flags)'} and language = ?
                 and target_code <> '' and eu.type = 'thingpedia' and eu.is_base = 1
                 and (ds.approved_version is not null or ds.owner = ?)
                 and (dc.approved_version is not null or dc.owner = ?))
                 order by id asc`,
                [language, kinds, org, kinds, language, org, org]);
        } else {
            return db.selectAll(client,
                `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                  eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                  device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                  and eu.type = 'thingpedia' ${includeSynthetic ? '' : 'and not find_in_set(\'synthetic\', flags)'} and language = ?
                  and ds.kind in (?) and target_code <> ''
                  and ds.approved_version is not null)
                union distinct
                (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                 eu.target_code,eu.click_count,eu.like_count,eu.name from example_utterances eu,
                 device_schema ds, device_class dc, device_class_kind dck where
                 eu.schema_id = ds.id and ds.kind = dck.kind and dck.device_id = dc.id
                 and not dck.is_child and dc.primary_kind in (?) ${includeSynthetic ? '' : 'and not find_in_set(\'synthetic\', flags)'} and language = ?
                 and target_code <> '' and eu.type = 'thingpedia' and eu.is_base = 1
                 and ds.approved_version is not null and dc.approved_version is not null)
                 order by id asc`,
                [language, kinds, kinds, language]);
        }
    },

    getBaseBySchema(client, schemaId, language, includeSynthetic) {
        return db.selectAll(client, `select * from example_utterances use index(language_type)
            where schema_id = ? and is_base and type = 'thingpedia' and language = ?
            ${includeSynthetic ? '' : 'and not find_in_set(\'synthetic\', flags)'}
            order by id asc`, [schemaId, language]);
    },

    getBaseBySchemaKind(client, schemaKind, language) {
        return db.selectAll(client, `select eu.* from example_utterances eu, device_schema ds where
            eu.schema_id = ds.id and ds.kind = ? and is_base and type = 'thingpedia' and not find_in_set('synthetic', flags)
            and language = ? order by id asc`
            , [schemaKind, language]);
    },

    createMany,
    create,
    insertStream(client, updateExisting) {
        return new stream.Writable({
            objectMode: true,
            highWaterMark: 200,

            write(obj, encoding, callback) {
                create(client, obj, updateExisting).then(() => callback(), callback);
            },
            writev(objs, callback) {
                createMany(client, objs.map((o) => o.chunk), updateExisting).then(() => callback(), callback);
            }
        });
    },

    logUtterance(client, data) {
        return db.insertOne(client, `insert into utterance_log set ?`, [data]);
    },

    deleteMany(client, ids) {
        if (ids.length === 0)
            return Promise.resolve();
        return db.query(client, "delete from example_utterances where id in (?)", [ids]);
    },

    deleteBySchema(client, schemaId, language) {
        return db.query(client, "delete from example_utterances where schema_id = ? and language = ?",
            [schemaId, language]);
    },

    update(client, id, example) {
        return db.query(client, "update example_utterances set ? where id = ?", [example, id]);
    },

    click(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = click_count + 1 where id = ?", [exampleId]);
    },

    async like(client, userId, exampleId) {
        const inserted = await db.insertIgnore(client, `insert ignore into example_likes(example_id, user_id) values (?, ?)`, [exampleId, userId]);
        if (inserted)
            await db.query(client, `update example_utterances set like_count = like_count + 1 where id = ?`, [exampleId]);
        return inserted;
    },

    async unlike(client, userId, exampleId) {
        await db.query(client, `update example_utterances set like_count = like_count - 1 where id = ? and
            exists (select 1 from example_likes where user_id = ? and example_id = ?)`, [exampleId, userId, exampleId]);
        const [result,] = await db.query(client, `delete from example_likes where user_id = ? and example_id = ?`, [userId, exampleId]);
        return result.affectedRows > 0;
    },

    hide(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = -1 where id = ?", [exampleId]);
    },

    deleteById(client, exampleId) {
        return db.query(client, "delete from example_utterances where id = ?", [exampleId]);
    },

    async deleteAllLikesFromUser(client, userId) {
        await db.query(client, `update example_utterances set like_count = like_count - 1 where
            exists (select 1 from example_likes where user_id = ? and example_id = id)`, [userId]);
        await db.query(client, `delete from example_likes where user_id = ?`, [userId]);
    },

    getTypes(client) {
        return db.selectAll(client, "select distinct language,type,count(*) as size from example_utterances group by language,type");
    },
    getByType(client, language, type, start, end) {
        return db.selectAll(client, `select * from example_utterances where not is_base and
            language = ? and type = ? and not find_in_set('replaced', flags)
             and not find_in_set('augmented', flags) order by id desc limit ?,?`,
            [language, type, start, end]);
    },

    getByIntentName(client, language, kind, name) {
        return db.selectOne(client, `select ex.* from example_utterances ex, device_schema ds
            where ds.id = ex.schema_id and ds.kind = ? and ex.language = ? and ex.name = ?`,
            [kind, language, name]);
    },

    getExact(client, language) {
        return db.selectAll(client, `select preprocessed,target_code from example_utterances use index (language_flags)
            where language = ? and find_in_set('exact', flags) and not is_base and preprocessed <> ''
            order by type asc, id asc`, [language]);
    },

    getExactById(client, exampleId) {
        return db.selectOne(client, `select preprocessed,target_code from example_utterances where id = ?`, [exampleId]);
    },

    suggest(client, command) {
        return db.query(client, "insert into command_suggestions (command) values (?)", command);
    }
};
