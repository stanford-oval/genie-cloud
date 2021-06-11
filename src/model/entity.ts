// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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

export interface Row {
    id : string;
    language : string;
    name : string;
    is_well_known : boolean;
    has_ner_support : boolean;
    subtype_of : string|null;
}
export type OptionalFields = 'is_well_known' | 'has_ner_support' | 'subtype_of';

export interface ValueRow {
    language : string;
    entity_id : string;
    entity_value : string;
    entity_canonical : string;
    entity_name : string;
}

export async function create(client : db.Client, entity : Omit<db.Optional<Row, OptionalFields>, 'language'>) {
    return db.insertOne(client, `replace into entity_names set language = 'en', ?`, [entity]);
}
export async function createMany(client : db.Client, entities : Array<db.Optional<Row, OptionalFields>>) {
    return db.insertOne(client, `replace into entity_names(id, language, name, is_well_known, has_ner_support, subtype_of) values ?`,
        [entities.map((e) => [e.id, e.language, e.name, e.is_well_known, e.has_ner_support, e.subtype_of])]);
}

export async function update(client : db.Client, id : string, entity : Partial<Row>) {
    await db.query(client, `update entity_names set ? where id = ?`, [entity, id]);
}
export async function updateMany(client : db.Client, entities : Array<Partial<Row>>) {
    await db.query(client, `insert into entity_names(id, language, name, is_well_known, has_ner_support, subtype_of) values ?
        on duplicate key update name=values(name), is_well_known=values(is_well_known), has_ner_support=values(has_ner_support),
        subtype_of=values(subtype_of)`,
        [entities.map((e) => [e.id, e.language, e.name, e.is_well_known, e.has_ner_support, e.subtype_of])]);
}

export async function get(client : db.Client, id : string, language = 'en') : Promise<Row> {
    return db.selectOne(client, "select * from entity_names where id = ? and language = ?",
                        [id, language]);
}

async function _delete(client : db.Client, id : string) {
    await db.query(client, `delete from entity_names where id = ?`, [id]);
}
export { _delete as delete };

export async function getAll(client : db.Client) : Promise<Row[]> {
    return db.selectAll(client, "select * from entity_names where language = 'en' order by is_well_known asc, id asc");
}

export async function getSnapshot(client : db.Client, snapshotId : number) : Promise<Row[]> {
    return db.selectAll(client, "select * from entity_names_snapshot where language = 'en' and snapshot_id =? order by is_well_known asc, id asc", [snapshotId]);
}

export async function getValues(client : db.Client, id : string) : Promise<Array<Pick<ValueRow, "entity_value"|"entity_name"|"entity_canonical">>> {
    return db.selectAll(client, "select distinct entity_value, entity_name, entity_canonical from entity_lexicon where entity_id = ? and language = 'en'", [id]);
}
export async function deleteValues(client : db.Client, id : string) {
    await db.query(client, `delete from entity_lexicon where entity_id = ? and language = 'en'`, [id]);
}
export function insertValueStream(client : db.Client) {
    return new stream.Writable({
        objectMode: true,
        highWaterMark: 100,
        write(obj, encoding, callback) {
            client.query(`insert into entity_lexicon set ?`, [obj], callback);
        },
        writev(objs, callback) {
            client.query(`insert into entity_lexicon(language,entity_id,entity_value,entity_canonical,entity_name) values ?`,
            [objs.map((o) => [o.chunk.language, o.chunk.entity_id, o.chunk.entity_value, o.chunk.entity_canonical, o.chunk.entity_name])],
            callback);
        }
    });
}

export async function lookup(client : db.Client, language : string, token : string) : Promise<Array<Omit<ValueRow, "language">>> {
    return db.selectAll(client, `select distinct entity_id,entity_value,entity_canonical,entity_name
                                    from entity_lexicon where language = ? and match entity_canonical
                                    against (? in natural language mode)
                                    union distinct select entity_id,entity_value,entity_canonical,entity_name
                                    from entity_lexicon where language = ? and entity_value = ?`, [language, token, language, token]);
}

export async function lookupWithType(client : db.Client, language : string, type : string, token : string) : Promise<Array<Omit<ValueRow, "language">>> {
    return db.selectAll(client, `select distinct entity_id,entity_value,entity_canonical,entity_name
                                    from entity_lexicon where language = ? and entity_id = ? and match entity_canonical
                                    against (? in natural language mode)
                                    union distinct select entity_id,entity_value,entity_canonical,entity_name
                                    from entity_lexicon where language = ? and entity_id = ? and
                                    entity_value = ?`, [language, type, token, language, type, token]);
}

export async function findNonExisting(client : db.Client, ids : string[]) {
    if (ids.length === 0)
        return Promise.resolve([]);
    return db.selectAll(client, "select id from entity_names where language='en' and id in (?)", [ids]).then((rows : Array<{ id : string }>) => {
        if (rows.length === ids.length)
            return [];
        const existing = new Set(rows.map((r) => r.id));
        const missing : string[] = [];
        for (const id of ids) {
            if (!existing.has(id))
                missing.push(id);
        }
        return missing;
    });
}
