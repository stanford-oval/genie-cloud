// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

const stream = require('stream');
const db = require('../util/db');

module.exports = {
    create(client, entity) {
        return db.insertOne(client, `insert into entity_names set language = 'en', ?`, [entity]);
    },
    createMany(client, entities) {
        return db.insertOne(client, `insert into entity_names(id, language, name, is_well_known, has_ner_support) values ?`,
            [entities.map((e) => [e.id, e.language, e.name, e.is_well_known, e.has_ner_support])]);
    },

    async update(client, id, entity) {
        await db.query(client, `update entity_names set ? where id = ?`, [entity, id]);
    },
    async updateMany(client, entities) {
        return db.query(client, `insert into entity_names(id, language, name, is_well_known, has_ner_support) values ?
            on duplicate key update name=values(name), is_well_known=values(is_well_known), has_ner_support=values(has_ner_support)`,
            [entities.map((e) => [e.id, e.language, e.name, e.is_well_known, e.has_ner_support])]);
    },

    get(client, id, language = 'en') {
        return db.selectOne(client, "select * from entity_names where id = ? and language = ?",
                            [id, language]);
    },

    delete(client, id) {
        return db.query(client, `delete from entity_names where id = ?`, [id]);
    },

    getAll(client) {
        return db.selectAll(client, "select * from entity_names where language = 'en' order by is_well_known asc, id asc");
    },

    getSnapshot(client, snapshotId) {
        return db.selectAll(client, "select * from entity_names_snapshot where language = 'en' and snapshot_id =? order by is_well_known asc, id asc", [snapshotId]);
    },

    getValues(client, id) {
        return db.selectAll(client, "select distinct entity_value, entity_name, entity_canonical from entity_lexicon where entity_id = ? and language = 'en'", [id]);
    },
    insertValueStream(client) {
        return new stream.Writable({
            objectMode: true,
            write(obj, encoding, callback) {
                client.query(`insert into entity_lexicon set ?`, [obj], callback);
            },
            writev(objs, callback) {
                client.query(`insert into entity_lexicon(language,entity_id,entity_value,entity_canonical,entity_name) values ?`,
                [objs.map((o) => [o.chunk.language, o.chunk.entity_id, o.chunk.entity_value, o.chunk.entity_canonical, o.chunk.entity_name])],
                callback);
            }
        });
    },

    lookup(client, language, token) {
        return db.selectAll(client, `select distinct entity_id,entity_value,entity_canonical,entity_name
                                     from entity_lexicon where language = ? and match entity_canonical
                                     against (? in natural language mode)
                                     union distinct select entity_id,entity_value,entity_canonical,entity_name
                                     from entity_lexicon where language = ? and entity_value = ?`, [language, token, language, token]);
    },

    lookupWithType(client, language, type, token) {
        return db.selectAll(client, `select distinct entity_id,entity_value,entity_canonical,entity_name
                                     from entity_lexicon where language = ? and entity_id = ? and match entity_canonical
                                     against (? in natural language mode)
                                     union distinct select entity_id,entity_value,entity_canonical,entity_name
                                     from entity_lexicon where language = ? and entity_id = ? and
                                     entity_value = ?`, [language, type, token, language, type, token]);
    },

    findNonExisting(client, ids) {
        if (ids.length === 0)
            return Promise.resolve([]);
        return db.selectAll(client, "select id from entity_names where language='en' and id in (?)", [ids]).then((rows) => {
            if (rows.length === ids.length)
                return [];
            let existing = new Set(rows.map((r) => r.id));
            let missing = [];
            for (let id of ids) {
                if (!existing.has(id))
                    missing.push(id);
            }
            return missing;
        });
    }
};
