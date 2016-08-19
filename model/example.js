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
    var KEYS = ['schema_id', 'is_base', 'language', 'utterance', 'target_json'];
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

    getAllWithLanguage: function(client, language) {
        return db.selectAll(client, "select * from example_utterances where language = ?", [language]);
    },

    getBaseByLanguage: function(client, language) {
        return db.selectAll(client, "select * from example_utterances where is_base and"
            + " language = ? order by schema_id, utterance",
            [language]);
    },

    getByKey: function(client, base, key, language) {
        var tokens = tokenize(key);

        return db.selectAll(client, "select eu.*, ds.kind from example_utterances eu, device_schema ds where"
            + " eu.schema_id = ds.id and eu.is_base = ? and language = ? and  match utterance against"
            + " (? in natural language mode) union distinct (select eu.*, ds.kind from example_utterances eu,"
            + " device_schema ds where eu.schema_id = ds.id and eu.is_base = ? and language = ? and ds.kind in (?))"
            + " union distinct (select eu.*, ds.kind from example_utterances eu, device_schema ds where eu.schema_id ="
            + " ds.id and eu.is_base = ? and language = ? and ds.kind in (select kind from device_class dc,"
            + " device_class_kind dck where dc.global_name in (?) and dc.id = dck.device_id and dck.is_child))",
            [base, language, key, base, language, tokens, base, language, tokens]);
    },

    getByKinds: function(client, base, kinds, language) {
        return db.selectAll(client, "select eu.*, ds.kind from example_utterances eu, device_schema ds where"
            + " eu.schema_id = ds.id and eu.is_base = ? and language = ? and ds.kind in (?) union"
            + " distinct (select eu.*, ds.kind from example_utterances eu, device_schema ds where eu.schema_id ="
            + " ds.id and eu.is_base = ? and language = ? and ds.kind in (select kind from device_class dc,"
            + " device_class_kind dck where dc.global_name in (?) and dc.id = dck.device_id and dck.is_child))",
            [base, language, kinds, base, language, kinds]);
    },

    getBaseBySchema: function(client, schemaId, language) {
        return db.selectAll(client, "select * from example_utterances where schema_id = ?"
            + " and is_base and language = ?", [schemaId, language]);
    },

    createMany: createMany,

    deleteBySchema: function(client, schemaId, language) {
        return db.query(client, "delete from example_utterances where schema_id = ? and language = ?",
            [schemaId, language]);
    },

    deleteByLanguage: function(client, language) {
        return db.query(client, "delete from example_utterances where language = ?",
            [language]);
    },

    update: function(client, id, example) {
        return db.query(client, "update example_utterances set ? where id = ?", [example, id]);
    }
};
