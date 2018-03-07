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
    var KEYS = ['name'];
    KEYS.forEach(function(key) {
        if (entity[key] === undefined)
            entity[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return entity[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into app(language,is_well_known,' + KEYS.join(',') + ') '
                        + 'values (\'en\', 0,' + marks.join(',') + ')', vals).then(function(id) {
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
        return db.selectAll(client, "select entity_id,entity_value,entity_canonical,entity_name from entity_lexicon where language = ? and token = ?", [language, token]);
    }
}
