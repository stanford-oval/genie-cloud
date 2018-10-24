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

function makeId(id, flags) {
    let prefix = '';
    if (flags.indexOf('replaced') >= 0)
        prefix += 'R';
    if (flags.indexOf('augmented') >= 0)
        prefix += 'P';
    if (flags.indexOf('synthetic') >= 0)
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
    const argv = parser.parseArgs();
    const language = argv.language;

    const rng = seedrandom(argv.random_seed);

    const [dbClient, dbDone] = await db.connect();

    let query;
    if (argv.quote_free) {
        query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
            where language = ? and find_in_set('training',flags) and find_in_set('replaced',flags)
            and target_code<>'' and preprocessed<>''`,
            [language]);
    } else {
        query = dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
            where language = ? and find_in_set('training',flags) and not find_in_set('replaced',flags)
            and target_code<>'' and preprocessed<>''`,
            [language]);
    }

    query.on('result', (row) => {
        const line = makeId(row.id, row.flags) + '\t' + row.preprocessed + '\t' + row.target_code + '\n';

        if (coin(argv.eval_prob, rng))
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
