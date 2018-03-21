// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const csv = require('csv');
const ThingTalk = require('thingtalk');
const seedrandom = require('seedrandom');

const db = require('../util/db');
const AdminThingpediaClient = require('../util/admin-thingpedia-client');

var insertBatch = [];

const rng = seedrandom.alea('almond is awesome ' + process.argv.join('\0'));
function coin(prob) {
    return rng() <= prob;
}
coin(1);

const _language = 'en';

function doInsertBatch(dbClient) {
    var batch = insertBatch;
    insertBatch = [];
    return db.insertOne(dbClient,
        "insert into example_utterances(language,type,utterance,preprocessed,target_code,target_json,click_count) values ?", [batch]);
}

function insert(dbClient, type, utterance, preprocessed, target_code) {
    insertBatch.push([_language, type, utterance, preprocessed.join(' '), target_code.join(' '), '', -1]);
    if (insertBatch.length < 100)
        return Q();
    return doInsertBatch(dbClient);

}
function finishBatch(dbClient) {
    if (insertBatch.length === 0)
        return Q();
    return doInsertBatch(dbClient);
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
    const devProbability = testProbability;

    const schemas = new ThingTalk.SchemaRetriever(new AdminThingpediaClient(_language), null, true);
    const tokenizerService = new ThingTalk.TokenizerService(_language);

    const rejects = csv.stringify({ header: true, delimiter:'\t' });
    rejects.pipe(fs.createWriteStream(typePrefix + '-rejects.tsv'));

    db.withTransaction((dbClient) => {
        let promises = [];

        const parser = csv.parse({ columns: true, delimiter: '\t' });
        process.stdin.pipe(parser);

        return Q.Promise((callback, errback) => {
            parser.on('data', (row) => {
                //console.log(row);
                let {id,thingtalk,paraphrase} = row;
                //let [,utterance,tt] = row;
                let testTrain = '';
                /*
                if (coin(testProbability))
                    testTrain = '-test';
                else if (coin(devProbability))
                    testTrain = '-dev';
                else
                    testTrain = '-train';
                */

                promises.push(Q.try(() =>
                    Q.all([parseAndTypecheck(isPermission, thingtalk, schemas),
                           tokenizerService.tokenize(paraphrase)])
                ).then(([prog, { tokens: preprocessed, entities }]) => {
                    let target_code = ThingTalk.NNSyntax.toNN(prog, entities);
                    for (let name in entities) {
                        if (name === '$used') continue;
                        throw new Error('Unused entity ' + name);
                    }
                    return insert(dbClient, typePrefix + testTrain, paraphrase, preprocessed, target_code);
                }).catch((e) => {
                    console.error('Failed to verify ' + id + ' ' + paraphrase + '   :' + e.message);
                    if (e.message === 'Connection lost: The server closed the connection.')
                        console.error(e.stack);
                    // record this input as rejected
                    //process.exit();
                    row.reason = e.message;
                    rejects.write(row);
                }));
            });
            parser.on('error', errback);
            parser.on('end', callback);
        })
        .then(() => Q.all(promises))
        .then(() => finishBatch(dbClient));
        //.then(() => writer.end());
    }).then(() => rejects.end()).done();

    rejects.on('finish', () => process.exit());
}
main();
