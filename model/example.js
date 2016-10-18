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
    var KEYS = ['schema_id', 'is_base', 'language', 'utterance', 'target_json', 'type', 'click_count'];
    var arrays = [];
    examples.forEach(function(ex) {
        if (!ex.type)
            ex.type = 'thingpedia';
        if (ex.click_count === undefined)
            ex.click_count = 5;
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
        var ftQuery = tokens.map((t) => t.replace(/[+\-@><~*"()]/g, '')).filter((t) => !!t).map((t) => t + '*').join(' ');

        return db.selectAll(client,
              " (select eu.*, ds.kind from example_utterances eu, device_schema ds where"
            + "  eu.schema_id = ds.id and (eu.is_base = ? or eu.type <> 'thingpedia') and language = ? and match utterance against"
            + "  (? in boolean mode) and eu.type <> 'ifttt' and eu.click_count >= 0)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, device_schema ds where eu.schema_id = ds.id"
            + "  and (eu.is_base = ? or eu.type <> 'thingpedia') and language = ? and ds.kind in (?) and eu.click_count >= 0)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, device_schema ds, device_class dc where (eu.is_base = ? or"
            + "  eu.type <> 'thingpedia') and eu.language = ? and dc.primary_kind in (?) and eu.schema_id = ds.id and"
            + "  ds.kind = dc.global_name and eu.click_count >= 0)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, device_schema ds, device_class dc, device_class_kind dck"
            + "  where eu.schema_id = ds.id and (eu.is_base = ? or eu.type <> 'thingpedia') and language = ? and"
            + "  ds.kind = dck.kind and dc.id = dck.device_id and (dc.global_name in (?) or dc.primary_kind in (?))"
            + "  and eu.click_count >= 0)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, example_rule_schema ers, device_schema ds where eu.id = ers.example_id"
            + "  and ers.schema_id = ds.id and language = ? and ds.kind in (?) and eu.type not in ('ifttt', 'thingpedia')"
            + "  and eu.click_count >= 0)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, example_rule_schema ers, device_schema ds, device_class dc"
            + "  where eu.language = ? and dc.primary_kind in (?) and eu.id = ers.example_id and ers.schema_id = ds.id"
            + "  and ds.kind = dc.global_name and eu.type not in ('ifttt', 'thingpedia') and eu.click_count >= 0)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, example_rule_schema ers, device_schema ds, device_class dc, device_class_kind dck"
            + "  where eu.id = ers.example_id and ers.schema_id = ds.id and language = ? and ds.kind = dck.kind and"
            + "  dc.id = dck.device_id and (dc.global_name in (?) or dc.primary_kind in (?)) and eu.type not in ('ifttt', 'thingpedia')"
            + "  and eu.click_count >= 0)"
            + " order by click_count desc, type, id asc limit 50",
            [base, language, ftQuery,
             base, language, tokens,
             base, language, tokens,
             base, language, tokens, tokens,
             language, tokens,
             language, tokens,
             language, tokens, tokens]);
    },

    getByKinds: function(client, base, kinds, language, minClickCount) {
        if (minClickCount === undefined)
            minClickCount = 0;

        return db.selectAll(client,
              " (select eu.*, ds.kind from example_utterances eu, device_schema ds where eu.schema_id = ds.id"
            + "  and (eu.is_base = ? or eu.type <> 'thingpedia') and language = ? and ds.kind in (?) and eu.click_count >= ?)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, device_schema ds, device_class dc where (eu.is_base = ? or"
            + "  eu.type <> 'thingpedia') and eu.language = ? and dc.primary_kind in (?) and eu.schema_id = ds.id and"
            + "  ds.kind = dc.global_name and eu.click_count >= ?)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, device_schema ds, device_class dc, device_class_kind dck"
            + "  where eu.schema_id = ds.id and (eu.is_base = ? or eu.type <> 'thingpedia') and language = ? and"
            + "  ds.kind = dck.kind and dc.id = dck.device_id and (dc.global_name in (?) or dc.primary_kind in (?))"
            + "  and eu.click_count >= ?)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, example_rule_schema ers, device_schema ds where eu.id = ers.example_id"
            + "  and ers.schema_id = ds.id and language = ? and ds.kind in (?) and eu.type not in ('ifttt', 'thingpedia')"
            + "  and eu.click_count >= ?)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, example_rule_schema ers, device_schema ds, device_class dc"
            + "  where eu.language = ? and dc.primary_kind in (?) and eu.id = ers.example_id and ers.schema_id = ds.id"
            + "  and ds.kind = dc.global_name and eu.type not in ('ifttt', 'thingpedia') and eu.click_count >= ?)"
            + " union"
            + " (select eu.*, ds.kind from example_utterances eu, example_rule_schema ers, device_schema ds, device_class dc, device_class_kind dck"
            + "  where eu.id = ers.example_id and ers.schema_id = ds.id and language = ? and ds.kind = dck.kind and"
            + "  dc.id = dck.device_id and (dc.global_name in (?) or dc.primary_kind in (?)) and eu.type not in ('ifttt', 'thingpedia')"
            + "  and eu.click_count >= ?)"
            + " order by click_count desc, type, id asc",
            [base, language, kinds, minClickCount,
             base, language, kinds, minClickCount,
             base, language, kinds, kinds, minClickCount,
             language, kinds, minClickCount,
             language, kinds, minClickCount,
             language, kinds, kinds, minClickCount]);
    },

    getBaseBySchema(client, schemaId, language) {
        return db.selectAll(client, "select * from example_utterances where schema_id = ?"
            + " and is_base and language = ?", [schemaId, language]);
    },

    createMany: createMany,

    deleteBySchema(client, schemaId, language) {
        return db.query(client, "delete from example_utterances where schema_id = ? and language = ?",
            [schemaId, language]);
    },

    deleteByLanguage(client, language) {
        return db.query(client, "delete from example_utterances where language = ?",
            [language]);
    },

    update(client, id, example) {
        return db.query(client, "update example_utterances set ? where id = ?", [example, id]);
    },

    click(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = click_count + 1 where id = ?", [exampleId]);
    },

    // for now, upvoting/downvoting goes into the click_count directly
    // in the future, we might want to separate them so that upvotes are counted more than clicks
    // and people are prevented from voting multiple times
    upvote(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = click_count + 1 where id = ?", [exampleId]);
    },

    downvote(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = greatest(-1, click_count - 1) where id = ?", [exampleId]);
    },

    hide(client, exampleId) {
        return db.query(client, "update example_utterances set click_count = -1 where id = ?", [exampleId]);
    },

    deleteById(client, exampleId) {
        return db.query(client, "delete from example_utterances where id = ?", [exampleId]);
    }
};
