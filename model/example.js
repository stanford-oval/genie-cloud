// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function createMany(client, examples) {
    var KEYS = ['schema_id', 'is_base', 'utterance', 'target_json'];
    var arrays = [];
    examples.forEach(function(ex) {
        KEYS.forEach(function(key) {
            if (ex[key] === undefined)
                ex[key] = null;
        });
        var vals = KEYS.map(function(key) {
            return ex[key];
        });
        arrays.push(vals);
    });

    return db.insertOne(client, 'insert into example_utterances(' + KEYS.join(',') + ') '
                        + 'values ?', [arrays]);
}

module.exports = {
    getAll: function(client) {
        return db.selectAll(client, "select * from example_utterances");
    },

    searchBase: function(client, key) {
        return db.selectAll(client, "select * from example_utterances where is_base and "
            + " match (utterance) against ?", [key]);
    },

    createMany: createMany,

    deleteBySchema: function(client, schemaId) {
        return db.query(client, "delete from example_utterances where schema_id = ?", [schemaId]);
    }
};
