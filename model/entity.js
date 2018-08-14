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
const Q = require('q');

module.exports = {
    create(client, entity) {
        return db.insertOne(client, `insert into entity_names set language = 'en', ?`, [entity]);
    },

    get(client, id, language = 'en') {
        return db.selectOne(client, "select * from entity_names where id = ? and language = ?",
                            [id, language]);
    },

    getAll(client) {
        return db.selectAll(client, "select * from entity_names where language = 'en' order by is_well_known asc, id asc");
    },

    getSnapshot(client, snapshotId) {
        return db.selectAll(client, "select * from entity_names_snapshot where language = 'en' and snapshot_id =? order by is_well_known asc, id asc", [snapshotId]);
    },

    getValues(client, id) {
        return db.selectAll(client, "select distinct entity_value, entity_name from entity_lexicon where entity_id = ? and language = 'en'", [id]);
    },

    lookup(client, language, token) {
        return db.selectAll(client, `select distinct entity_id,entity_value,entity_canonical,entity_name
                                     from entity_lexicon where language = ? and match entity_canonical
                                     against (? in natural language mode)`, [language, token]);
    },

    lookupWithType(client, language, type, token) {
        return db.selectAll(client, `select distinct entity_id,entity_value,entity_canonical,entity_name
                                     from entity_lexicon where language = ? and entity_id = ? and match entity_canonical
                                     against (? in natural language mode)`, [language, type, token]);
    },

    checkAllExist(client, ids) {
        if (ids.length === 0)
            return Q();
        return db.selectAll(client, "select id from entity_names where language='en' and id in (?)", [ids]).then((rows) => {
            if (rows.length === ids.length)
                return;
            let existing = new Set(rows.map((r) => r.id));
            let missing = [];
            for (let id of ids) {
                if (!existing.has(id))
                    missing.push(id);
            }
            if (missing.length > 0)
                throw new Error('Invalid entity types: ' + missing.join(', '));
        });
    }
};
