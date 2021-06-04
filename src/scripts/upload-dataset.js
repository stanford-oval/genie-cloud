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
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>

import * as fs from 'fs';
import byline from 'byline';
import * as Stream from 'stream';
import * as Genie from 'genie-toolkit';

import * as db from '../util/db';
import { makeFlags } from '../util/genie_flag_utils';
import * as StreamUtils from '../util/stream-utils';
import * as exampleModel from '../model/example';

function maybeCreateReadStream(filename) {
    if (filename === '-')
        return process.stdin;
    else
        return fs.createReadStream(filename);
}

function readAllLines(files, separator = '') {
    return StreamUtils.chain(files.map((s) => s.setEncoding('utf8').pipe(byline())), { objectMode: true, separator });
}

export function initArgparse(subparsers) {
    const parser = subparsers.add_parser('upload-dataset', {
        add_help: true,
        description: 'Upload Thingpedia Dataset'
    });
    parser.add_argument('-l', '--language', {
        required: true,
    });
    parser.add_argument('-t', '--type', {
        required: true,
        help: 'The type to assign to this dataset.',
    });
    parser.add_argument('--contextual', {
        action: 'store_true',
        default: false,
        help: 'Process a contextual dataset.'
    });
    parser.add_argument('--exact', {
        action: 'store_true',
        default: false,
        help: 'Include this dataset in the exact match.'
    });
    parser.add_argument('--no-exact', {
        action: 'store_false',
        dest: 'exact',
        help: 'Do not include this dataset in the exact match.'
    });
    parser.add_argument('--training', {
        action: 'store_true',
        default: true,
        help: 'Use this dataset for training.'
    });
    parser.add_argument('--no-training', {
        action: 'store_false',
        dest: 'training',
        help: 'Do not use this dataset for training.'
    });
    parser.add_argument('--preserve-id', {
        action: 'store_true',
        default: false,
        help: 'Preserve IDs of uploaded sentences (and update the existing sentence if they already exist)'
    });
    parser.add_argument('input_file', {
        nargs: '+',
        type: maybeCreateReadStream,
        help: 'Input datasets to import (in TSV format); use - for standard input'
    });
}

export async function main(argv) {
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
