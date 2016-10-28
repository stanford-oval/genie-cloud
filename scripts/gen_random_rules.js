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

const db = require('../util/db');
const genRandomRules = require('../util/gen_random_rule');
const reconstruct = require('./deps/reconstruct');
const SchemaRetriever = require('./deps/schema_retriever');
const SempreSyntax = require('../util/sempre_syntax');

const dlg = { _(x) { return x; } };

function postprocess(str) {
    return str.replace(/your/g, 'my').replace(/you/g, 'me');
}

function main() {
    var output = fs.createWriteStream(process.argv[2] || 'output.tsv');
    var samplingPolicy = process.argv[3] || 'uniform';
    var language = process.argv[4] || 'en';
    var N = process.argv[5] || 100;

    db.withClient((dbClient) => {
        var schemaRetriever = new SchemaRetriever(dbClient, language);
        return genRandomRules(dbClient, schemaRetriever, samplingPolicy, language, N).then((rules) => {
            return Q.all(rules.map((r) => reconstruct(dlg, schemaRetriever, r))).then((reconstructed) => {
                for (var i = 0; i < rules.length; i++) {
                    output.write(SempreSyntax.toThingTalk(rules[i]));
                    output.write('\t');
                    output.write(postprocess(reconstructed[i]));
                    output.write('\n');
                }
            });
        });
    }).then(() => output.end()).done();

    output.on('finish', () => process.exit());
}

main();
