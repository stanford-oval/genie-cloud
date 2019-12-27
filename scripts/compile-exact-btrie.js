// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 Google LLC
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Stream = require('stream');
const byline = require('byline');
const fs = require('fs');
const assert = require('assert');
const Genie = require('genie-toolkit');

const StreamUtils = require('../util/stream-utils');
const BTrie = require('../util/btrie');
const Trie = require('../util/trie');
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
        for (let [key, value] of matcher) {
            const clone = Array.from(key);
            for (let i = 0; i < clone.length; i++) {
                if (clone[i] === Trie.WILDCARD)
                    clone[i] = BTrie.WILDCARD;
            }
            builder.insert(clone, value);
        }

        argv.output.end(builder.build());
        await StreamUtils.waitFinish(argv.output);
    }
};
