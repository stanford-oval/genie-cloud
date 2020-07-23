#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const byline = require('byline');
const Stream = require('stream');
const Genie = require('genie-toolkit');

const db = require('../util/db');
const { makeFlags } = require('../util/genie_flag_utils');
const StreamUtils = require('../util/stream-utils');
const exampleModel = require('../model/example');

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
        const parser = subparsers.addParser('upload-dataset', {
            addHelp: true,
            description: 'Upload Thingpedia Dataset'
        });
        parser.addArgument(['-l', '--language'], {
            required: true,
        });
        parser.addArgument(['-t', '--type'], {
            required: true,
            help: 'The type to assign to this dataset.',
        });
        parser.addArgument(['--contextual'], {
            nargs: 0,
            action: 'storeTrue',
            defaultValue: false,
            help: 'Process a contextual dataset.'
        });
        parser.addArgument(['--exact'], {
            nargs: 0,
            action: 'storeTrue',
            defaultValue: false,
            help: 'Include this dataset in the exact match.'
        });
        parser.addArgument(['--no-exact'], {
            nargs: 0,
            action: 'storeFalse',
            dest: 'exact',
            help: 'Do not include this dataset in the exact match.'
        });
        parser.addArgument(['--training'], {
            nargs: 0,
            action: 'storeTrue',
            defaultValue: true,
            help: 'Use this dataset for training.'
        });
        parser.addArgument(['--no-training'], {
            nargs: 0,
            action: 'storeFalse',
            dest: 'training',
            help: 'Do not use this dataset for training.'
        });
        parser.addArgument(['--preserve-id'], {
            nargs: 0,
            action: 'storeTrue',
            defaultValue: false,
            help: 'Preserve IDs of uploaded sentences (and update the existing sentence if they already exist)'
        });
        parser.addArgument('input_file', {
            nargs: '+',
            type: maybeCreateReadStream,
            help: 'Input datasets to import (in TSV format); use - for standard input'
        });
    },

    async main(argv) {
        await db.withTransaction(async (dbClient) => {
            const output = readAllLines(argv.input_file)
                .pipe(new Genie.DatasetParser({ contextual: argv.contextual }))
                .pipe(new Stream.Transform({
                    objectMode: true,

                    transform(ex, encoding, callback) {
                        ex.flags.training = argv.training;
                        ex.flags.exact = argv.exact;
                        callback(null, {
                            id: argv.preserve_id ? ex.id : undefined,
                            language: argv.language,
                            utterance: ex.preprocessed,
                            preprocessed: ex.preprocessed,
                            target_json: '',
                            target_code: ex.target_code,
                            context: ex.context || null,
                            type: argv.type,
                            flags: makeFlags(ex.flags),
                            is_base: 0
                        });
                    },

                    flush(callback) {
                        process.nextTick(callback);
                    }
                }))
                .pipe(exampleModel.insertStream(dbClient, argv.preserve_id));

            await StreamUtils.waitFinish(output);
        });

        await db.tearDown();
    }
};
