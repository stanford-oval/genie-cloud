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
const argparse = require('argparse');
const seedrandom = require('seedrandom');

const Genie = require('genie-toolkit');

const db = require('../util/db');
const { parseFlags } = require('./flag_utils');

function waitFinish(stream) {
    return new Promise((resolve, reject) => {
        stream.once('finish', resolve);
        stream.on('error', reject);
    });
}

async function main() {
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Update Thingpedia Dataset'
    });
    parser.addArgument(['-l', '--language'], {
        required: true,
    });
    parser.addArgument(['--train'], {
        required: true,
        type: fs.createWriteStream,
        help: 'Train file output path',
    });
    parser.addArgument(['--eval'], {
        required: true,
        type: fs.createWriteStream,
        help: 'Eval file output path',
    });
    parser.addArgument(['--test'], {
        required: false,
        type: fs.createWriteStream,
        help: 'Test file output path',
        defaultValue: null
    });
    parser.addArgument(['--eval-probability'], {
        type: Number,
        help: 'Eval probability',
        defaultValue: 0.1,
    });
    parser.addArgument(['--split-strategy'], {
        help: 'Method to use to choose training and evaluation sentences',
        defaultValue: 'sentence',
        choices: ['id', 'raw-sentence', 'sentence', 'program', 'combination']
    });
    parser.addArgument(['--random-seed'], {
        help: 'Random seed',
        defaultValue: 'abcdefghi',
    });
    parser.addArgument(['--quote-free'], {
        nargs: 0,
        action: 'storeTrue',
        help: 'Download quote-free dataset',
    });
    parser.addArgument(['--no-quote-free'], {
        nargs: 0,
        action: 'storeFalse',
        dest: 'quote_free',
        help: argparse.SUPPRESS,
    });
    parser.addArgument(['-d', '--device'], {
        action: 'append',
        metavar: 'DEVICE',
        help: 'Restrict download to commands of the given device. This option can be passed multiple times to specify multiple devices',
        dest: 'forDevices',
    });
    parser.addArgument(['-t', '--type'], {
        action: 'append',
        metavar: 'TYPE',
        help: 'Restrict download to commands in the given dataset type.',
        dest: 'types',
    });
    const argv = parser.parseArgs();
    const language = argv.language;
    const forDevices = argv.forDevices || [];
    const types = argv.types || [];

    const [dbClient, dbDone] = await db.connect();

    let query;
    if (forDevices.length > 0) {
        const regexp = ' @(' + forDevices.map((d) => d.replace('.', '\\.')).join('|') + ')\\.[A-Za-z0-9_]+( |$)';

        if (argv.quote_free) {
            query = dbClient.query(`select id,flags,preprocessed,target_code from replaced_example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags)
                and target_code<>'' and preprocessed<>'' and target_code rlike ?`,
                [language, regexp]);
        } else {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags)
                and target_code<>'' and preprocessed<>'' and target_code rlike ?`,
                [language, regexp]);
        }
    } else if (types.length > 0) {
        if (argv.quote_free) {
            query = dbClient.query(`select id,flags,preprocessed,target_code from replaced_example_utterances
                use index (language_type) where language = ? and find_in_set('training',flags)
                and target_code<>'' and preprocessed<>'' and type in (?)`,
                [language, types]);
        } else {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_type) where language = ? and find_in_set('training',flags)
                and target_code<>'' and preprocessed<>'' and type in (?)`,
                [language, types]);
        }
    } else {
        if (argv.quote_free) {
            query = dbClient.query(`select id,flags,preprocessed,target_code from replaced_example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags)
                and target_code<>'' and preprocessed<>''`,
                [language]);
        } else {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags)
                and target_code<>'' and preprocessed<>''`,
                [language]);
        }
    }
    if (argv.test)
        argv.eval_prob *= 2;

    const train = new Genie.DatasetStringifier();
    const eval_ = new Genie.DatasetStringifier();
    const promises = [];
    promises.push(waitFinish(train.pipe(argv.train)));
    promises.push(waitFinish(eval_.pipe(argv.eval)));
    let test = null;
    if (argv.test) {
        test = new Genie.DatasetStringifier();
        promises.push(waitFinish(test.pipe(argv.test)));
    }

    const splitter = new Genie.DatasetSplitter({
        rng: seedrandom.alea(argv.random_seed),
        locale: argv.language,
        debug: false,

        train,
        eval: eval_,
        test,

        evalProbability: argv.eval_probability,
        forDevices: argv.forDevices,
        splitStrategy: argv.split_strategy,
    });

    query.on('result', (row) => {
        row.flags = parseFlags(row.flags);
        row.flags.replaced = !!argv.quote_free;
        splitter.write(row);
    });
    query.on('end', () => {
        splitter.end();
        dbDone();
    });

    await Promise.all(promises);
    await db.tearDown();
}

main();
