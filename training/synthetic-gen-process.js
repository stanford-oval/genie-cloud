#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// load thingpedia to initialize the polyfill
require('thingpedia');

process.on('unhandledRejection', (up) => { throw up; });

const argparse = require('argparse');
const seedrandom = require('seedrandom');
const byline = require('byline');
const Tp = require('thingpedia');
const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const StreamUtils = require('../../util/stream-utils');
const ActionSetFlag = require('../lib/action_set_flag');

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

        templateFile: 'index.genie',

        rng: rng,
        locale: args.locale,
        flags: args.flags || {},
        maxDepth: args.maxdepth,
        debug: false, // no debugging, ever, because debugging also goes to stdout
    };

    const generator = new Genie.BasicSentenceGenerator(options);
    generator.on('progress', (value) => {
        process.send({ cmd:'progress', v: value });
    });
    const stringifier = new Genie.DatasetStringifier();

    generator.pipe(stringifier).pipe(process.stdout);
    await StreamUtils.waitFinish(process.stdout);
}

async function genContextual(args) {
    const inputFile = process.stdin.setEncoding('utf8').pipe(byline());

    // FIXME compute progress (progress is not compatible with parallel generation)

    const options = {
        locale: args.locale,
        flags: args.flags,
        template: 'index.genie',
        random_seed: 'almond is awesome',
        maxdepth: args.maxdepth,
        debug: false, // no debugging, ever, because debugging also goes to stdout
    };

    inputFile
        .pipe(Genie.parallelize(PARALLEL_GENERATION,
            require.resolve('./workers/generate-contextual-worker.js'), options))
        .pipe(new Genie.DatasetStringifier())
        .pipe(process.stdout);
    await StreamUtils.waitFinish(process.stdout);
}

async function main() {
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Generate synthetic set inside sandbox'
    });

    parser.addArgument(['-l', '--locale'], {
        required: false,
        defaultValue: 'en-US',
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
    parser.addArgument('--unset-flag', {
        required: false,
        nargs: 1,
        action: ActionSetFlag,
        constant: false,
        metavar: 'FLAG',
        help: 'Unset (clear) a flag for the construct template file.',
    });
    parser.addArgument('--maxdepth', {
        required: false,
        type: Number,
        defaultValue: 5,
        help: 'Maximum depth of sentence generation',
    });
    parser.addArgument('--contextual', {
        required: false,
        nargs: 0,
        action: 'storeTrue',
        defaultValue: false,
        help: 'Generate a contextual dataset',
    });

    const args = parser.parseArgs();

    if (args.contextual)
        await genContextual(args);
    else
        await genBasic(args);
}
main();
