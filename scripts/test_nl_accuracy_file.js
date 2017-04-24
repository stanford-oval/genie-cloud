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
const byline = require('byline');

const AccuracyTester = require('./deps/test_nl_accuracy_common');

function main() {
    var queue = AccuracyTester();

    var language = process.argv[2] || 'en';
    var file = fs.createReadStream(process.argv[3]);
    file.setEncoding('utf8');
    var input = byline(file);

    var i = 0;
    input.on('data', (line) => {
        var split = line.split('\t');
        var ex = {
            id: split[0],
            utterance: split[1],
            target_json: split[2]
        };
        queue.enqueue(ex);
    });
    input.on('end', () => { queue.done(); });
    input.on('error', (e) => { console.error(e) });
}

main();
