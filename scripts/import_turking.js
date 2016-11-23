// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const csv = require('csv');

const db = require('../util/db');
const SchemaRetriever = require('./deps/schema_retriever');
const SempreSyntax = require('../util/sempre_syntax');

var insertBatch = [];

function makeType(testTrain, primCompound, nparams) {
    //return (testTrain === 'test' ? 'test' : 'turking') + '-' + (primCompound === 'compound' ? 'compound' : 'prim') + nparams;
    return 'test' + '-' + (primCompound === 'compound' ? 'compound' : 'prim') + nparams;
}

function insert(dbClient, utterance, testTrain, primCompound, nparams, target_json) {
    insertBatch.push(['en', 'test-old', utterance, target_json, -1]);
    if (insertBatch.length < 100)
        return;

    var batch = insertBatch;
    insertBatch = [];
    return db.insertOne(dbClient,
        "insert into example_utterances(language,type,utterance,target_json,click_count) values ?", [batch]);
}
function finishBatch(dbClient) {
    if (insertBatch.length === 0)
        return;
    return db.insertOne(dbClient,
        "insert into example_utterances(language,type,utterance,target_json,click_count) values ?", [insertBatch]);
}

function maybeInsert(dbClient, utterance, testTrain, primCompound, nparams, target_json) {
    if (utterance.length < 25)
        return Q();

    utterance = utterance.replace(/[,.]"/g, '"').replace(/[\n\t]+/g, ' ');
    return insert(dbClient, utterance, testTrain, primCompound, nparams, target_json);
}

function main() {
    db.withTransaction((dbClient) => {
        var promises = [];
        var schemas = new SchemaRetriever(dbClient, 'en-US', true);

        var parser = csv.parse({ columns: null });
        process.stdin.pipe(parser);
        //var output = fs.createWriteStream(process.argv[2]);
        //var writer = csv.stringify({ delimiter: '\t' });
        //writer.pipe(output);

        return Q.Promise((callback, errback) => {
            parser.on('data', (row) => {
                var id = row[0];
                var tt = row[1];
                //var original = row[2];
                //var useful = row[3];
                //var utterances = row.slice(2);
                var utterance = row[2];
                var testTrain = row[3];
                var primCompound = row[4];
                var nparams = row[5];

                promises.push(Q.try(() => {
                    //var json = SempreSyntax.toSEMPRE(tt);
                    var json = JSON.parse(tt);
                    var json_str = JSON.stringify(json);
                    return SempreSyntax.verify(schemas, json).then(() => {
                        return insert(dbClient, utterance, testTrain, primCompound, nparams, json_str);
                        //return Q.all(utterances.map((u) => {
                        //    return maybeInsert(dbClient, u, json_str);
                        //}));
                    });
                }).catch((e) => {
                    console.error('Failed to verify ' + tt + '   :' + e.message);
                }));
            });
            parser.on('error', errback);
            parser.on('end', callback);
        })
        .then(() => Q.all(promises))
        .then(() => finishBatch(dbClient));
        //.then(() => writer.end());
    }).then(() => process.exit()).done();
}
main();
