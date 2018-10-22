// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

function createMany(client, examples) {
    if (examples.length === 0)
        return Promise.resolve();

    const KEYS = ['id', 'schema_id', 'is_base', 'flags', 'language', 'utterance', 'preprocessed',
                  'target_json', 'target_code', 'type', 'click_count', 'owner'];
    const arrays = [];
    examples.forEach((ex) => {
        if (!ex.type)
            ex.type = 'thingpedia';
        if (ex.click_count === undefined)
            ex.click_count = 1;
        KEYS.forEach((key) => {
            if (ex[key] === undefined)
                ex[key] = null;
        });
        const vals = KEYS.map((key) => {
            return ex[key];
        });
        arrays.push(vals);
    });

    return db.insertOne(client, 'insert into example_utterances(' + KEYS.join(',') + ') '
                        + 'values ?', [arrays]);
}

function create(client, ex) {
    if (!ex.type)
        ex.type = 'thingpedia';
    if (ex.click_count === undefined)
        ex.click_count = 1;

    return db.insertOne(client, 'insert into example_utterances set ?', [ex]);
}

module.exports = {
    getAll(client) {
        console.error('example.getAll called, where is this from?');
        return db.selectAll(client, "select * from example_utterances");
    },

    getCommands(client, language, start, end) {
        if (start !== undefined && end !== undefined) {
            return db.selectAll(client, `select eu.id,eu.language,eu.type,eu.utterance,
            eu.preprocessed,eu.target_code,eu.click_count,u.username as owner_name
            from example_utterances eu left join users u on u.id = eu.owner where
            type = 'commandpedia' and language = ? order by click_count desc limit ?,?`, [language, start, end + 1]);
        } else {
            return db.selectAll(client, `select eu.id,eu.language,eu.type,eu.utterance,
            eu.preprocessed,eu.target_code,eu.click_count,u.username as owner_name
            from example_utterances eu left join users u on u.id = eu.owner where
            type = 'commandpedia' and language = ? order by click_count desc`, [language]);
        }
    },

    getCommandsByFuzzySearch(client, language, query) {
        return db.selectAll(client, `select eu.id,eu.language,eu.type,eu.utterance,
            eu.preprocessed,eu.target_code,eu.click_count,u.username as owner_name
            from example_utterances eu left join users u on u.id = eu.owner where
            type = 'commandpedia' and language = ? and ( utterance like ? or target_code like ?)
            order by click_count desc`, [language, `%${query}%`, `%${query}%`]);
    },

    getCheatsheet(client, language) {
        return db.selectAll(client, `select eu.id,eu.utterance,eu.target_code,ds.kind
            from example_utterances eu, device_schema ds where eu.schema_id = ds.id and
            eu.is_base = 1 and eu.type = 'thingpedia' and language = ? and ds.approved_version is not null
            order by click_count desc, id asc`,
            [language]);
    },

    getByKey(client, key, org, language) {
        if (org === -1) { // admin
            return db.selectAll(client,
              `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and language = ?
                and match preprocessed against (?) and target_code <> '')
               union distinct
               (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and language = ?
                and match kind_canonical against (?) and target_code <> '')
               limit 50`,
            [language, key, language, key]);
        } else if (org !== null) {
            return db.selectAll(client,
              `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and language = ?
                and match preprocessed against (?) and target_code <> ''
                and (ds.approved_version is not null or ds.owner = ?))
               union distinct
               (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and language = ?
                and match kind_canonical against (?) and target_code <> ''
                and (ds.approved_version is not null or ds.owner = ?))
               limit 50`,
            [language, key, org, language, key, org]);
        } else {
            return db.selectAll(client,
              `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and language = ?
                and match preprocessed against (?) and target_code <> ''
                and ds.approved_version is not null)
               union distinct
               (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                eu.target_code,eu.click_count from example_utterances eu,
                device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                and eu.type = 'thingpedia' and language = ?
                and match kind_canonical against (?) and target_code <> ''
                and ds.approved_version is not null)
               limit 50`,
            [language, key, language, key]);
        }
    },

    getByKinds(client, kinds, org, language) {
        if (org === -1) { // admin
            return db.selectAll(client,
                `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                  eu.target_code,eu.click_count from example_utterances eu,
                  device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                  and eu.type = 'thingpedia' and language = ?
                  and ds.kind in (?) and target_code <> '')
                union distinct
                (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                 eu.target_code,eu.click_count from example_utterances eu,
                 device_schema ds, device_class dc, device_class_kind dck where
                 eu.schema_id = ds.id and ds.kind = dck.kind and dck.device_id = dc.id
                 and not dck.is_child and dc.primary_kind in (?) and language = ?
                 and target_code <> '' and eu.type = 'thingpedia' and eu.is_base = 1)`,
                [language, kinds, kinds, language]);
        } else if (org !== null) {
            return db.selectAll(client,
                `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                  eu.target_code,eu.click_count from example_utterances eu,
                  device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                  and eu.type = 'thingpedia' and language = ?
                  and ds.kind in (?) and target_code <> ''
                  and (ds.approved_version is not null or ds.owner = ?))
                union distinct
                (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                 eu.target_code,eu.click_count from example_utterances eu,
                 device_schema ds, device_class dc, device_class_kind dck where
                 eu.schema_id = ds.id and ds.kind = dck.kind and dck.device_id = dc.id
                 and not dck.is_child and dc.primary_kind in (?) and language = ?
                 and target_code <> '' and eu.type = 'thingpedia' and eu.is_base = 1
                 and (ds.approved_version is not null or ds.owner = ?)
                 and (dc.approved_version is not null or dc.owner = ?))`,
                [language, kinds, org, kinds, language, org, org]);
        } else {
            return db.selectAll(client,
                `(select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                  eu.target_code,eu.click_count from example_utterances eu,
                  device_schema ds where eu.schema_id = ds.id and eu.is_base = 1
                  and eu.type = 'thingpedia' and language = ?
                  and ds.kind in (?) and target_code <> ''
                  and ds.approved_version is not null)
                union distinct
                (select eu.id,eu.language,eu.type,eu.utterance,eu.preprocessed,
                 eu.target_code,eu.click_count from example_utterances eu,
                 device_schema ds, device_class dc, device_class_kind dck where
                 eu.schema_id = ds.id and ds.kind = dck.kind and dck.device_id = dc.id
                 and not dck.is_child and dc.primary_kind in (?) and language = ?
                 and target_code <> '' and eu.type = 'thingpedia' and eu.is_base = 1
                 and ds.approved_version is not null and dc.approved_version is not null)`,
                [language, kinds, kinds, language]);
        }
    },

    getBaseBySchema(client, schemaId, language) {
        return db.selectAll(client, "select * from example_utterances where schema_id = ?"
            + " and is_base and type = 'thingpedia' and language = ?", [schemaId, language]);
    },

    getBaseBySchemaKind(client, schemaKind, language) {
        return db.selectAll(client, `(select eu.* from example_utterances eu, device_schema ds where
            eu.schema_id = ds.id and ds.kind = ? and is_base and type = 'thingpedia' and language = ?)`
            , [schemaKind, language]);
    },

    createMany,
    create,

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

    // for now, upvoting/downvoting goes into the click_count directly
    // in the future, we might want to separate them so that upvotes are counted more than clicks
    // and people are prevented from voting multiple times
    upvote(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = click_count + 1 where id = ?", [exampleId]);
    },

    downvote(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = greatest(-1, click_count - 1) where id = ?", [exampleId]);
    },

    hide(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = -1 where id = ?", [exampleId]);
    },

    deleteById(client, exampleId) {
        return db.query(client, "delete from example_utterances where id = ?", [exampleId]);
    },

    getTypes(client) {
        return db.selectAll(client, "select distinct language,type,count(*) as size from example_utterances group by language,type");
    },
    getByType(client, language, type, start, end) {
        return db.selectAll(client, "select * from example_utterances where not is_base and language = ? and type = ? order by id desc limit ?,?",
            [language, type, start, end]);
    },

    suggest(client, command) {
        return db.query(client, "insert into command_suggestions (command) values (?)", command);
    }
};
