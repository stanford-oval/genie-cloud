// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as stream from 'stream';

import * as db from '../util/db';
import { tokenize, stripUnsafeTokens } from '../util/tokenize';

export interface Row {
    id : number;
    schema_id : number|null;
    is_base : boolean;
    language : string;
    type : string;
    flags : string;
    utterance : string;
    preprocessed : string;
    target_json : string;
    target_code : string;
    context : string|null;
    click_count : number;
    like_count : number;
    owner : number|null;
    name : string|null;
}
export type OptionalFields = 'schema_id' | 'is_base' | 'language' | 'type' | 'flags'
    | 'context' | 'click_count' | 'like_count' | 'owner' | 'name';

export interface LogRow {
    id : number;
    language : string;
    context : string|null;
    preprocessed : string;
    target_code : string;
    time : Date;
}
export type LogOptionalFields = 'language' | 'context' | 'time';

export interface SuggestionRow {
    id : string;
    command : string;
    suggest_time : Date;
}
export type SuggestionOptionalFields = 'suggest_time';

export async function createMany(client : db.Client, examples : Array<db.WithoutID<db.Optional<Row, OptionalFields>>>, updateExisting : boolean) {
    if (examples.length === 0)
        return Promise.resolve();

    const KEYS = ['id', 'schema_id', 'is_base', 'flags', 'language', 'utterance', 'preprocessed',
                  'target_json', 'target_code', 'context',
                  'type', 'click_count', 'like_count', 'owner', 'name'] as const;
    const arrays : any[] = [];
    examples.forEach((ex) => {
        if (!ex.type)
            ex.type = 'thingpedia';
        if (ex.click_count === undefined)
            ex.click_count = 1;
        ex.like_count = 0;
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

export async function create(client : db.Client, ex : db.WithoutID<db.Optional<Row, OptionalFields>>, updateExisting ?: boolean) {
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

export async function getAll(client : db.Client) : Promise<Row[]> {
    console.error('example.getAll called, where is this from?');
    return db.selectAll(client, "select * from example_utterances");
}

type CommandRow = Pick<Row, "id"|"language"|"type"|"utterance"|"preprocessed"|"target_code"
    |"click_count"|"like_count"|"is_base"> & {
    kind : string|null;
    owner_name : string|null;
};
type CommandRowForUser = CommandRow & { liked : boolean };

// The ForUser variants of getCommands and getCommandsByFuzzySearch
// return an additional column, "liked", which is a boolean indicating
// whether the named user liked the given command or not
// They are used to color the hearts in Commandpedia, if the user is logged in
export async function getCommandsForUser(client : db.Client, language : string, userId : number, start ?: number, end ?: number) : Promise<CommandRowForUser[]> {
    const query = `
        (select eu.id,eu.language,eu.type,eu.utterance,
            eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,null as kind,u.username as owner_name,
            (exists (select 1 from example_likes where example_id = eu.id and user_id = ?)) as liked
            from example_utterances eu left join users u on u.id = eu.owner where
            type = 'commandpedia' and language = ? and not find_in_set('replaced', flags)
            and not find_in_set('augmented', flags) and not find_in_set('obsolete', flags)
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
}

export async function getCommandsByFuzzySearchForUser(client : db.Client, language : string, userId : number, query : string) : Promise<CommandRowForUser[]> {
    const regexp = '(^| )(' + stripUnsafeTokens(tokenize(query)).join('|') + ')( |$)';
    return db.selectAll(client, `
        (select eu.id,eu.language,eu.type,eu.utterance,
            eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,null as kind,u.username as owner_name,
            (exists (select 1 from example_likes where example_id = eu.id and user_id = ?)) as liked
            from example_utterances eu left join users u on u.id = eu.owner where
            type = 'commandpedia' and language = ? and not find_in_set('replaced', flags)
            and not find_in_set('augmented', flags) and not find_in_set('obsolete', flags)
            and ( utterance like ? or target_code like ?)
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
}

export async function getCommands(client : db.Client, language : string, start ?: number, end ?: number) : Promise<CommandRow[]> {
    const query = `
        (select eu.id,eu.language,eu.type,eu.utterance,
            eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,null as kind,u.username as owner_name
            from example_utterances eu left join users u on u.id = eu.owner where
            type = 'commandpedia' and language = ? and not find_in_set('replaced', flags)
            and not find_in_set('augmented', flags) and not find_in_set('obsolete', flags)
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
}

export async function getCommandsByFuzzySearch(client : db.Client, language : string, query : string) : Promise<CommandRow[]> {
    const regexp = '(^| )(' + stripUnsafeTokens(tokenize(query)).join('|') + ')( |$)';
    return db.selectAll(client, `
        (select eu.id,eu.language,eu.type,eu.utterance,
            eu.preprocessed,eu.target_code,eu.click_count,eu.like_count,eu.is_base,null as kind,u.username as owner_name
            from example_utterances eu left join users u on u.id = eu.owner where
            type = 'commandpedia' and language = ? and not find_in_set('replaced', flags)
            and not find_in_set('augmented', flags) and not find_in_set('obsolete', flags)
            and ( utterance like ? or target_code like ?)
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
}

export async function getCheatsheet(client : db.Client, language : string) : Promise<Array<Pick<Row, "id"|"utterance"|"target_code"> & { kind : string }>> {
    return db.selectAll(client, `select eu.id,eu.utterance,eu.target_code,ds.kind
        from example_utterances eu, device_schema ds where eu.schema_id = ds.id and
        eu.is_base = 1 and eu.type = 'thingpedia' and language = ? and ds.approved_version is not null
        order by click_count desc, id asc`,
        [language]);
}

type PrimitiveTemplateRow = Pick<Row, "id"|"language"|"type"|"utterance"|"preprocessed"|"target_code"|"click_count"|"like_count"|"name">;

export async function getBaseByLanguage(client : db.Client, org : number|null, language : string) : Promise<Array<Omit<PrimitiveTemplateRow, "type"|"language">>> {
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
}

export async function getByKey(client : db.Client, key : string, org : number|null, language : string) : Promise<PrimitiveTemplateRow[]> {
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
}

export async function getByKinds(client : db.Client, kinds : string[], org : number|null, language : string, includeSynthetic ?: boolean) : Promise<PrimitiveTemplateRow[]> {
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
}

export async function getBaseBySchema(client : db.Client, schemaId : number, language : string, includeSynthetic ?: boolean) : Promise<Row[]> {
    return db.selectAll(client, `select * from example_utterances use index(language_type)
        where schema_id = ? and is_base and type = 'thingpedia' and language = ?
        ${includeSynthetic ? '' : 'and not find_in_set(\'synthetic\', flags)'}
        order by id asc`, [schemaId, language]);
}

export async function getBaseBySchemaKind(client : db.Client, schemaKind : string, language : string) : Promise<Row[]> {
    return db.selectAll(client, `select eu.* from example_utterances eu, device_schema ds where
        eu.schema_id = ds.id and ds.kind = ? and is_base and type = 'thingpedia' and not find_in_set('synthetic', flags)
        and language = ? order by id asc`
        , [schemaKind, language]);
}

export function insertStream(client : db.Client, updateExisting : boolean) {
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
}

export async function logUtterance(client : db.Client, data : db.WithoutID<db.Optional<LogRow, LogOptionalFields>>) {
    return db.insertOne(client, `insert into utterance_log set ?`, [data]);
}

export async function deleteMany(client : db.Client, ids : number[]) {
    if (ids.length === 0)
        return;
    await db.query(client, "delete from example_utterances where id in (?)", [ids]);
}

export async function deleteBySchema(client : db.Client, schemaId : number, language : string) {
    await db.query(client, "delete from example_utterances where schema_id = ? and language = ?",
        [schemaId, language]);
}

export async function update(client : db.Client, id : number, example : Partial<Row>) {
    await db.query(client, "update example_utterances set ? where id = ?", [example, id]);
}

export async function click(client : db.Client, exampleId : number) {
    await db.query(client, "update example_utterances set click_count = click_count + 1 where id = ?", [exampleId]);
}

export async function like(client : db.Client, userId : number, exampleId : number) {
    const inserted = await db.insertIgnore(client, `insert ignore into example_likes(example_id, user_id) values (?, ?)`, [exampleId, userId]);
    if (inserted)
        await db.query(client, `update example_utterances set like_count = like_count + 1 where id = ?`, [exampleId]);
    return inserted;
}

export async function unlike(client : db.Client, userId : number, exampleId : number) {
    await db.query(client, `update example_utterances set like_count = like_count - 1 where id = ? and
        exists (select 1 from example_likes where user_id = ? and example_id = ?)`, [exampleId, userId, exampleId]);
    const [result,] = await db.query(client, `delete from example_likes where user_id = ? and example_id = ?`, [userId, exampleId]);
    return result.affectedRows > 0;
}

export async function hide(client : db.Client, exampleId : number) {
    await db.query(client, "update example_utterances set click_count = -1 where id = ?", [exampleId]);
}

export async function deleteById(client : db.Client, exampleId : number) {
    await db.query(client, "delete from example_utterances where id = ?", [exampleId]);
}

export async function deleteAllLikesFromUser(client : db.Client, userId : number) {
    await db.query(client, `update example_utterances set like_count = like_count - 1 where
        exists (select 1 from example_likes where user_id = ? and example_id = id)`, [userId]);
    await db.query(client, `delete from example_likes where user_id = ?`, [userId]);
}

export async function getTypes(client : db.Client) : Promise<Array<{ language : string, type : string, size : number }>> {
    return db.selectAll(client, "select distinct language,type,count(*) as size from example_utterances group by language,type");
}
export async function getByType(client : db.Client, language : string, type : string, start : number, end : number) : Promise<Row[]> {
    return db.selectAll(client, `select * from example_utterances where not is_base and
        language = ? and type = ? and not find_in_set('replaced', flags)
            and not find_in_set('augmented', flags) order by id desc limit ?,?`,
        [language, type, start, end]);
}

export async function getByIntentName(client : db.Client, language : string, kind : string, name : string) : Promise<Row> {
    return db.selectOne(client, `select ex.* from example_utterances ex, device_schema ds
        where ds.id = ex.schema_id and ds.kind = ? and ex.language = ? and ex.name = ?`,
        [kind, language, name]);
}

export async function getExact(client : db.Client, language : string) : Promise<Array<Pick<Row, "preprocessed"|"target_code">>> {
    return db.selectAll(client, `select preprocessed,target_code from example_utterances use index (language_flags)
        where language = ? and find_in_set('exact', flags) and not is_base and preprocessed <> ''
        order by type asc, id asc`, [language]);
}

export async function getExactById(client : db.Client, exampleId : number) : Promise<Pick<Row, "preprocessed"|"target_code">> {
    return db.selectOne(client, `select preprocessed,target_code from example_utterances where id = ?`, [exampleId]);
}

export async function suggest(client : db.Client, command : db.WithoutID<db.Optional<SuggestionRow, SuggestionOptionalFields>>) {
    await db.query(client, "insert into command_suggestions (command) values (?)", [command]);
}
