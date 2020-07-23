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

const Genie = require('genie-toolkit');

const db = require('../util/db');
const { parseFlags } = require('../util/genie_flag_utils');
const StreamUtils = require('../util/stream-utils');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('download-dataset', {
            addHelp: true,
            description: 'Download Thingpedia Dataset'
        });
        parser.addArgument(['-l', '--language'], {
            required: true,
        });
        parser.addArgument(['-o', '--output'], {
            required: true,
            type: fs.createWriteStream,
            help: 'Output path',
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
        parser.addArgument(['--include-obsolete'], {
            nargs: 0,
            action: 'storeTrue',
            help: 'Include obsolete sentences (sentences that no longer typecheck).',
        });
    },

    async main(argv) {
        const language = argv.language;
        const forDevices = argv.forDevices || [];
        const types = argv.types || [];

        const [dbClient, dbDone] = await db.connect();

        let query;
        let args = [language];
        let includeSyntheticClause = `and not find_in_set('synthetic',flags)`;
        let includeObsoleteClause = argv.include_obsolete ? '' : `and not find_in_set('obsolete',flags)`;
        let filterClause = '';
        if (forDevices.length > 0) {
            const regexp = ' @(' + forDevices.map((d) => d.replace(/[.\\]/g, '\\$&')).join('|') + ')\\.[A-Za-z0-9_]+( |$)';
            filterClause = 'and target_code rlike ?';
            args.push(regexp);
        } else if (types.length === 1) {
            if (types[0] === 'generated')
                includeSyntheticClause ='';
            filterClause = 'and type like ?';
            args.push(types[0]);
        } else if (types.length > 0) {
            filterClause = 'and type in (?)';
            args.push(types);
        } else {
            includeSyntheticClause = '';
        }

        query = `select id,flags,preprocessed,target_code from example_utterances
                where language = ? and find_in_set('training',flags) and not find_in_set('template',flags)
                ${includeSyntheticClause} ${includeObsoleteClause} ${filterClause}
                and target_code<>'' and preprocessed<>''
                order by id asc`;
        query = dbClient.query(query, args);
        if (argv.test)
            argv.eval_prob *= 2;

        const writer = new Genie.DatasetStringifier();
        writer.pipe(argv.output);

        query.on('result', (row) => {
            row.flags = parseFlags(row.flags);
            row.flags.replaced = false;
            row.flags.eval = row.flags.exact;
            writer.write(row);
        });
        query.on('end', () => {
            writer.end();
            dbDone();
        });
        query.on('error', (e) => { throw e; });

        await StreamUtils.waitFinish(argv.output);
        await db.tearDown();
    }
};
