// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const csv = require('csv')
const parse = require('csv-parse');

const SempreSyntax = require('../util/sempre_syntax.js');
const AccuracyTester = require('./deps/test_nl_accuracy_common.js')

function main() {
    var queue = AccuracyTester();
    fs.createReadStream(process.argv[2])
        .pipe(parse({delimiter: ','}))
        .on('data', (row) => {
            var ex = {
                id: row[0],
                utterance: row[3],
                target_json: JSON.stringify(SempreSyntax.toSEMPRE(row[1]))
            }
            queue.enqueue(ex);
        })
        .on('end', () => { queue.done(); })
        .on('error', (err) => { console.error(err) });
}

main();
