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
const crypto = require('crypto');

const db = require('../util/db');
const genRandomRules = require('../util/gen_random_rule');
const reconstruct = require('./deps/reconstruct');
const SchemaRetriever = require('./deps/schema_retriever');
const SempreSyntax = require('../util/sempre_syntax');

const dlg = { _(x) { return x; } };

function postprocess(str) {
    str = str.replace(/your/g, 'my').replace(/ you /g, ' I ');

    //if (coin(0.1))
    //    str = str.replace(/ instagram /i, ' ig ');
    //if (coin(0.1))
    //    str = str.replace(/ facebook /i, ' fb ');

    return str;
}

function coin(bias) {
    return Math.random() < bias;
}

function makeId() {
    return crypto.randomBytes(8).toString('hex');
}

function main() {
    var output = csv.stringify();
    var file = fs.createWriteStream(process.argv[2] || 'output.csv');
    output.pipe(file);
    var samplingPolicy = process.argv[3] || 'uniform';
    var language = process.argv[4] || 'en';
    var N = parseInt(process.argv[5]) || 100;

    var inflight = 0;
    var done = false;
    function maybeEnd() {
        if (done && inflight === 0)
            output.end();
    }
    var i = 0;
    db.withClient((dbClient) => {
        var schemaRetriever = new SchemaRetriever(dbClient, language);
        return genRandomRules(dbClient, schemaRetriever, samplingPolicy, language, N).then((stream) => {
            return new Q.Promise((callback, errback) => {
                stream.on('data', (r) => {
                    //console.log('Rule #' + (i+1));
                    i++;
                    inflight++;
                    reconstruct(dlg, schemaRetriever, r).then((reconstructed) => {
                        output.write([makeId(), SempreSyntax.toThingTalk(r), postprocess(reconstructed)]);
                        inflight--;
                        maybeEnd();
                    }).done();
                });
                stream.on('error', errback);
                stream.on('end', callback);
            });
        });
    }).then(() => {
        done = true;
        maybeEnd();
    }).done();

    file.on('finish', () => process.exit());
}

main();
