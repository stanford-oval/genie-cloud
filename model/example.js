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

function tokenize(string) {
    var tokens = string.split(/(\s+|[,\.\"\'])/g);
    return tokens.filter((t) => !(/^\s*$/).test(t)).map((t) => t.toLowerCase());
}

module.exports = {
    getAll: function(client) {
        return db.selectAll(client, "select * from example_utterances");
    },

    getByKey: function(client, base, key) {
        var tokens = tokenize(key);

        return db.selectAll(client, "select eu.*, ds.kind from example_utterances eu, device_schema ds where"
            + " eu.schema_id = ds.id and eu.is_base = ? and  match utterance against"
            + " (? in natural language mode) union distinct (select eu.*, ds.kind from example_utterances eu,"
            + " device_schema ds where eu.schema_id = ds.id and eu.is_base = ? and ds.kind in (?))",
            [base, key, base, tokens]);
    },

    createMany: createMany,

    deleteBySchema: function(client, schemaId) {
        return db.query(client, "delete from example_utterances where schema_id = ?", [schemaId]);
    },

    update: function(client, id, example) {
        return db.query(client, "update example_utterances set ? where id = ?", [example, id]);
    }
};
