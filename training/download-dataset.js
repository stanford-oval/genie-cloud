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

const db = require('../util/db');

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
    parser.addArgument(['-o', '--output'], {
        type: fs.createWriteStream,
        help: 'Write to the specified file instead of standard output',
        defaultValue: process.stdout,
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
    const output = argv.output;

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
        output.write(makeId(row.id, row.flags) + '\t' + row.preprocessed + '\t' + row.target_code + '\n');
    });
    query.on('end', () => {
        if (output !== process.stdout)
            output.end();
        dbDone();
        db.tearDown();
    });
}

main();
