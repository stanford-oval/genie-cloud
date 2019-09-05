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
const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const FileThingpediaClient = require('../util/file_thingpedia_client');
const StreamUtils = require('../util/stream-utils');
const ActionSetFlag = require('./lib/action_set_flag');

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

    const args = parser.parseArgs();

    const tpClient = new FileThingpediaClient(args.locale, './thingpedia.tt', './entities.json', './dataset.tt');
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
    /*generator.on('progress', (value) => {
        console.error('progress:' + value);
    });*/
    const stringifier = new Genie.DatasetStringifier();

    generator.pipe(stringifier).pipe(process.stdout);
    await StreamUtils.waitFinish(process.stdout);
}
main();
