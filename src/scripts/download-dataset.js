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
"use strict";

const fs = require('fs');

const Genie = require('genie-toolkit');

const db = require('../util/db');
const { parseFlags } = require('../util/genie_flag_utils');
const StreamUtils = require('../util/stream-utils');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.add_parser('download-dataset', {
            add_help: true,
            description: 'Download Thingpedia Dataset'
        });
        parser.add_argument('-l', '--language', {
            required: true,
        });
        parser.add_argument('-o', '--output', {
            required: true,
            type: fs.createWriteStream,
            help: 'Output path',
        });
        parser.add_argument('-d', '--device', {
            action: 'append',
            metavar: 'DEVICE',
            help: 'Restrict download to commands of the given device. This option can be passed multiple times to specify multiple devices',
            dest: 'forDevices',
        });
        parser.add_argument('-t', '--type', {
            action: 'append',
            metavar: 'TYPE',
            help: 'Restrict download to commands in the given dataset type.',
            dest: 'types',
        });
        parser.add_argument('--include-obsolete', {
            action: 'store_true',
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
