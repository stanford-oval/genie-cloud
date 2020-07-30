#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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

// load thingpedia to initialize the polyfill
require('thingpedia');

process.on('unhandledRejection', (up) => { throw up; });

const net = require('net');
const argparse = require('argparse');
const seedrandom = require('seedrandom');
const byline = require('byline');
const Tp = require('thingpedia');
const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const StreamUtils = require('../util/stream-utils');
const ActionSetFlag = require('./lib/action_set_flag');

const PARALLEL_GENERATION = 4;

async function genBasic(args) {
    const tpClient = new Tp.FileClient({
        locale: args.locale,
        thingpedia: './thingpedia.tt',
        entities: './entities.json',
        dataset: './dataset.tt'
    });
    const schemas = new ThingTalk.SchemaRetriever(tpClient, null, true);

    const rng = seedrandom.alea('almond is awesome');

    const options = {
        thingpediaClient: tpClient,
        schemaRetriever: schemas,

        templateFiles: ['index.genie'],
        targetLanguage: 'thingtalk',

        rng: rng,
        locale: args.locale,
        flags: args.flags || {},
        maxDepth: args.maxdepth,
        targetPruningSize: args.target_pruning_size,
        debug: true,
    };

    const generator = new Genie.BasicSentenceGenerator(options);
    generator.on('progress', (value) => {
        process.send({ cmd:'progress', v: value });
    });
    const stringifier = new Genie.DatasetStringifier();

    // fd 4 is a "pipe" (see sandboxed_synthetic_gen.js) which our parent set up
    // to stream the sentences into
    // "pipes" in nodejs are actually unix domain sockets created with socketpair()
    // so we wrap them into a net.Socket
    const output = new net.Socket({ fd: 4 });
    generator.pipe(stringifier).pipe(output);
    await StreamUtils.waitFinish(output);

    process.disconnect();
}

async function genContextual(args) {
    const inputFile = process.stdin.setEncoding('utf8').pipe(byline());

    // FIXME compute progress (progress is not compatible with parallel generation)

    const options = {
        locale: args.locale,
        thingpedia: './thingpedia.tt',
        entities: './entities.json',
        dataset: './dataset.tt',
        flags: args.flags,
        template: 'contextual.genie',
        random_seed: 'almond is awesome',
        maxDepth: args.maxdepth,
        targetPruningSize: args.target_pruning_size,
        debug: false, // no debugging, ever, because debugging also goes to stdout
    };

    const output = new net.Socket({ fd: 4 });
    inputFile
        .pipe(Genie.parallelize(PARALLEL_GENERATION,
            require.resolve('./workers/generate-contextual-worker.js'), options))
        .pipe(new Genie.DatasetStringifier())
        .pipe(output);

    await StreamUtils.waitFinish(output);

    process.disconnect();
}

async function main() {
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Generate synthetic set inside sandbox'
    });

    parser.addArgument(['-l', '--locale'], {
        required: true,
        help: `BGP 47 locale tag of the language to generate (defaults to 'en-US', English)`
    });
    parser.addArgument('--set-flag', {
        required: false,
        nargs: 1,
        action: ActionSetFlag,
        constant: true,
        metavar: 'FLAG',
        help: 'Set a flag for the construct template file.',
    });
    parser.addArgument('--maxdepth', {
        required: true,
        type: Number,
        help: 'Maximum depth of sentence generation',
    });
    parser.addArgument('--contextual', {
        required: false,
        nargs: 0,
        action: 'storeTrue',
        defaultValue: false,
        help: 'Generate a contextual dataset',
    });
    parser.addArgument('--target-pruning-size', {
        required: true,
        type: Number,
        help: 'Target pruning size hyperparameter'
    });

    const args = parser.parseArgs();

    if (args.contextual)
        await genContextual(args);
    else
        await genBasic(args);
}
main();
