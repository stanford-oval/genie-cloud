// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const fs = require('fs');
const stream = require('stream');
const seedrandom = require('seedrandom');

const SentenceGenerator = require('../training/sentence-generator');
const AdminThingpediaClient = require('../util/admin-thingpedia-client');

function main() {
    let [,, outputFile, _language, maxDepth, turkingFlag] = process.argv;
    if (maxDepth === undefined)
        maxDepth = 6;
    else
        maxDepth = parseInt(maxDepth);
    if (isNaN(maxDepth))
        throw new Error('invalid max depth');
    const options = {
        rng: seedrandom.alea('almond is awesome'),
        language: _language,
        thingpediaClient: new AdminThingpediaClient(_language),
        turkingMode: turkingFlag === '--turking',
        maxDepth: maxDepth,
        debug: true
    };

    const generator = new SentenceGenerator(options);
    const transform = new stream.Transform({
        writableObjectMode: true,
        
        transform(ex, encoding, callback) {
            callback(null, ex.id + '\t' + ex.utterance + '\t' + ex.target_code + '\n');
        },
        
        flush(callback) {
            process.nextTick(callback);
        }
    });

    const outfile = outputFile || 'output.tsv';
    const output = fs.createWriteStream(outfile);

    generator.pipe(transform).pipe(output);

    output.on('finish', () => process.exit());
}
return main();
