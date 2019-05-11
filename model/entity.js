// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

module.exports = {
    create(client, entity) {
        return db.insertOne(client, `insert into entity_names set language = 'en', ?`, [entity]);
    },
    createMany(client, entities) {
        return db.insertOne(client, `insert into entity_names(id, language, name, is_well_known, has_ner_support) values ?`,
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
