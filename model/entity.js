// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function create(client, entity) {
    var KEYS = ['id','name','is_well_known','has_ner_support'];
    KEYS.forEach(function(key) {
        if (entity[key] === undefined)
            entity[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return entity[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into entity_names(language,' + KEYS.join(',') + ') '
                        + 'values (\'en\',' + marks.join(',') + ')', vals).then(function(id) {
                            entity.id = id;
                            return entity;
                        });
}

module.exports = {
    create,

    get(client, id) {
        return db.selectOne(client, "select * from entity_names where id = ? and language = 'en'",
                            [id]);
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
        return db.selectAll(client, "select distinct entity_id,entity_value,entity_canonical,entity_name from entity_lexicon where language = ? and match entity_canonical against (? in natural language mode)", [language, token]);
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
}
