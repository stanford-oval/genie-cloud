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
const byline = require('byline');
const ThingTalk = require('thingtalk');

const db = require('../util/db');
const SchemaRetriever = require('./deps/schema_retriever');
const tokenizer = require('../util/tokenize');

var insertBatch = [];

function coin(bias) {
    return Math.random() < bias;
}

function insert(dbClient, utterance, type, target_json) {
    insertBatch.push(['en', type, utterance, target_json, -1]);
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

function parseAndTypecheck(isPermission, code, schemas) {
    let parse, typecheck;

    if (isPermission) {
        parse = ThingTalk.Grammar.parsePermissionRule;
        typecheck = ThingTalk.Generate.typeCheckPermissionRule;
    } else {
        parse = ThingTalk.Grammar.parse;
        typecheck = ThingTalk.Generate.typeCheckProgram;
    }

    let prog = parse(code);
    return typecheck(prog, schemas).then(() => prog);
}

function main() {
    const isPermission = process.argv[3] === 'permissions';
    const typePrefix = process.argv[2];
    if (!typePrefix)
        throw new Error('Must specify the type of dataset (eg turking1 or policy2 or setup2)');
    const testProbability = parseFloat(process.argv[4]) || 0.1;

    db.withTransaction((dbClient) => {
        let promises = [];
        const schemas = new SchemaRetriever(dbClient, 'en-US', true);

        const parser = csv.parse();
        process.stdin.pipe(parser);

        return Q.Promise((callback, errback) => {
            parser.on('data', (row) => {
                let id = row[0];
                let original = row[1];
                let utterance = row[2];
                let tt = row[3];
                let testTrain;
                if (coin(testProbability))
                    testTrain = '-test';
                else
                    testTrain = '-train';

                //if (tokenizer.tokenize(utterance).length < 3)
                //    return;

                promises.push(Q.try(() => {
                    if (tt.startsWith('{'))
                        return ThingTalk.SEMPRESyntax.parseToplevel(schemas, JSON.parse(tt));
                    else
                        return parseAndTypecheck(isPermission, tt, schemas);
                }).then((prog) => {
                    let json_str;
                    if (tt.startsWith('{')) {
                        json_str = tt;
                    } else {
                        let json = ThingTalk.SEMPRESyntax.toSEMPRE(prog, false);
                        json_str = JSON.stringify(json);
                    }
                    return insert(dbClient, utterance, typePrefix + testTrain, json_str);
                }).catch((e) => {
                    console.error('Failed to verify ' + tt + '   :' + e.message);
                    // die uglily to fail the transaction
                    process.exit();
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
