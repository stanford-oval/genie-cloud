#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const argparse = require('argparse');
const seedrandom = require('seedrandom');

const db = require('../util/db');
const { coin } = require('../util/random');

function parseFlags(flags) {
    const parsed = {};
    for (let flag of flags.split(','))
        parsed[flag] = true;
    return parsed;
}

function makeId(id, flags) {
    let prefix = '';
    if (flags.replaced)
        prefix += 'R';
    if (flags.augmented)
        prefix += 'P';
    if (flags.synthetic)
        prefix += 'S';
    return prefix + id;
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
    parser.addArgument(['--eval-prob'], {
        type: Number,
        help: 'Eval probability',
        defaultValue: 0.1,
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
    const forDevices = argv.forDevices;
    const types = argv.types || [];

    const rng = seedrandom(argv.random_seed);

    const [dbClient, dbDone] = await db.connect();

    let query;
    if (forDevices && forDevices.length > 0) {
        const regexp = ' @(' + forDevices.map((d) => d.replace('.', '\\.')).join('|') + ')\\.[A-Za-z0-9_]+( |$)';

        if (argv.quote_free) {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags) and find_in_set('replaced',flags)
                and target_code<>'' and preprocessed<>'' and target_code rlike ?`,
                [language, regexp]);
        } else {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags) and not find_in_set('replaced',flags)
                and target_code<>'' and preprocessed<>'' and target_code rlike ?`,
                [language, regexp]);
        }
    } else if (types.length > 0) {
        if (argv.quote_free) {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_type) where language = ? and find_in_set('training',flags) and find_in_set('replaced',flags)
                and target_code<>'' and preprocessed<>'' and type in (?)`,
                [language, types]);
        } else {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_type) where language = ? and find_in_set('training',flags) and not find_in_set('replaced',flags)
                and target_code<>'' and preprocessed<>'' and type in (?)`,
                [language, types]);
        }
    } else {
        if (argv.quote_free) {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags) and find_in_set('replaced',flags)
                and target_code<>'' and preprocessed<>''`,
                [language]);
        } else {
            query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags) and not find_in_set('replaced',flags)
                and target_code<>'' and preprocessed<>''`,
                [language]);
        }
    }

    query.on('result', (row) => {
        const flags = parseFlags(row.flags);
        const line = makeId(row.id, flags) + '\t' + row.preprocessed + '\t' + row.target_code + '\n';

        if (!flags.synthetic && !flags.augmented && coin(argv.eval_prob, rng))
            argv.eval.write(line);
        else
            argv.train.write(line);
    });
    query.on('end', () => {
        argv.train.end();
        argv.eval.end();
        dbDone();
        db.tearDown();
    });
}

main();
