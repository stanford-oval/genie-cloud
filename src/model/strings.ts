// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

export type License = 'public-domain' | 'free-permissive' | 'free-copyleft' | 'non-commercial' | 'proprietary';

export interface Row {
    id : number;
    language : string;
    type_name : string;
    name : string;
    license : License;
    attribution : string;
}
export type OptionalFields = 'license';

export interface ValueRow {
    type_id : number;
    value : string;
    preprocessed : string;
    weight : number;
}

export async function create<T extends db.Optional<Row, OptionalFields>>(client : db.Client, stringType : db.WithoutID<T>) : Promise<db.WithID<T>> {
    const id = await db.insertOne(client, `insert into string_types set ?`, [stringType]);
    stringType.id = id;
    return stringType as db.WithID<T>;
}
export async function createMany(client : db.Client, stringTypes : Array<db.WithoutID<db.Optional<Row, OptionalFields>>>) {
    await db.insertOne(client, `insert into string_types(language, type_name, name, license, attribution) values ?`,
        [stringTypes.map((st) => [st.language, st.type_name, st.name, st.license, st.attribution])]);
}

export async function update(client : db.Client, id : number, stringType : Partial<Row>) {
    await db.query(client, `update string_types set ? where id = ?`, [stringType, id]);
}

export async function deleteValues(client : db.Client, id : number) {
    await db.query(client, `delete from string_values where type_id = ?`, [id]);
}
export function insertValueStream(client : db.Client) {
    return new stream.Writable({
        objectMode: true,
        highWaterMark: 500,
        write(obj, encoding, callback) {
            client.query(`insert into string_values set ?`, [obj], callback);
        },
        writev(objs, callback) {
            client.query(`insert into string_values(type_id, value, preprocessed, weight) values ?`,
            [objs.map((o) => [o.chunk.type_id, o.chunk.value, o.chunk.preprocessed, o.chunk.weight])], callback);
        }
    });
}

export async function get(client : db.Client, id : number, language = 'en') : Promise<Row> {
    return db.selectOne(client, `select * from string_types where id = ? and language = ?`,
                        [id, language]);
}
export async function getByTypeName(client : db.Client, typeName : string, language = 'en') : Promise<Row> {
    return db.selectOne(client, `select * from string_types where type_name = ? and language = ?`,
                        [typeName, language]);
}

export async function deleteByTypeName(client : db.Client, typeName : string) {
    await db.query(client, `delete from string_types where type_name = ?`, [typeName]);
}

export async function getAll(client : db.Client, language = 'en') : Promise<Row[]> {
    return db.selectAll(client, `select * from string_types where language = ? order by type_name asc`,
        [language]);
}

export async function getValues(client : db.Client, typeName : string, language = 'en') : Promise<Array<Omit<ValueRow, "type_id">>> {
    return db.selectAll(client, `select value, preprocessed, weight from string_values, string_types
        where type_id = id and type_name = ? and language = ?`, [typeName, language]);
}

export function streamValues(client : db.Client, typeName : string, language = 'en') {
    return client.query(`select value, preprocessed, weight from string_values, string_types
        where type_id = id and type_name = ? and language = ?`, [typeName, language]);
}

export async function findNonExisting(client : db.Client, ids : string[]) {
    if (ids.length === 0)
        return Promise.resolve([]);
    return db.selectAll(client, "select type_name from string_types where language='en' and type_name in (?)", [ids]).then((rows : Array<{ type_name : string }>) => {
        if (rows.length === ids.length)
            return [];
        const existing = new Set(rows.map((r) => r.type_name));
        const missing : string[] = [];
        for (const id of ids) {
            if (!existing.has(id))
                missing.push(id);
        }
        return missing;
    });
}
