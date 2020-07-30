// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const Stream = require('stream');
const byline = require('byline');
const fs = require('fs');
const assert = require('assert');
const Genie = require('genie-toolkit');

const StreamUtils = require('../util/stream-utils');
const BTrie = require('../util/btrie');
const ExactMatcher = require('../nlp/exact');

function maybeCreateReadStream(filename) {
    if (filename === '-')
        return process.stdin;
    else
        return fs.createReadStream(filename);
}

function readAllLines(files, separator = '') {
    return StreamUtils.chain(files.map((s) => s.setEncoding('utf8').pipe(byline())), { objectMode: true, separator });
}


module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('compile-exact-btrie', {
            addHelp: true,
            description: 'Compile an exact match dataset'
        });
        parser.addArgument(['-o', '--output'], {
            required: true,
            type: fs.createWriteStream,
        });
        parser.addArgument('input_file', {
            nargs: '+',
            type: maybeCreateReadStream,
            help: 'Input datasets to import (in TSV format); use - for standard input'
        });
    },

    async main(argv) {
        const matcher = new ExactMatcher;

        const output = readAllLines(argv.input_file)
            .pipe(new Genie.DatasetParser({ contextual: argv.contextual }))
            .pipe(new Stream.Writable({
                objectMode: true,

                write(ex, encoding, callback) {
                    matcher.add(ex.preprocessed, ex.target_code);
                    callback();
                },
            }));
        await StreamUtils.waitFinish(output);

        const builder = new BTrie.Builder((existing, newValue) => {
            assert(typeof newValue === 'string');
            if (existing === undefined)
                return newValue;
            else
                return existing + '\0' + newValue;
        });
        for (let [key, value] of matcher)
            builder.insert(key, value);

        argv.output.end(builder.build());
        await StreamUtils.waitFinish(argv.output);
    }
};
