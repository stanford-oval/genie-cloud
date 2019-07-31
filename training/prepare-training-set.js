#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });
require('../util/config_init');

const Stream = require('stream');
const seedrandom = require('seedrandom');
const argparse = require('argparse');
const fs = require('fs');

const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const { parseFlags } = require('./flag_utils');
const DatabaseParameterProvider = require('./param_provider');
const StreamUtils = require('./stream-utils');
const genSynthetic = require('./sandboxed_synthetic_gen');

const schemaModel = require('../model/schema');
const orgModel = require('../model/organization');
const platform = require('../util/platform');
const db = require('../util/db');

const MAX_SPAN_LENGTH = 10;

class QueryReadableAdapter extends Stream.Readable {
    constructor(query) {
        super({ objectMode: true });

        query.on('result', (row) => {
            row.flags = parseFlags(row.flags);
            // treat paraphrase data as synthetic, which will prevent
            // from evaluating on it
            if (!row.flags.exact)
                row.flags.synthetic = true;
            this.push(row);
        });
        query.on('end', () => {
            this.push(null);
        });
        query.on('error', (e) => {
            this.emit('error', e);
        });
    }

    _read() {}
}

class DatasetGenerator {
    constructor(language, forDevices, options) {
        this._language = language;
        this._options = options;
        this._rng = seedrandom.alea('almond is awesome');

        this._forDevices = forDevices;

        this._dbClient = null;
        this._tpClient = null;
        this._schemas = null;
        this._augmenter = null;
    }

    _downloadParaphrase() {
        let query;
        if (this._forDevicesPattern !== null) {
            query = this._dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ?
                and find_in_set('training',flags) and not find_in_set('obsolete',flags)
                and target_code<>'' and preprocessed<>'' and type <> 'generated' and target_code rlike ?
                order by id`,
                [this._language, this._forDevicesPattern]);
        } else {
            query = this._dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ?
                and find_in_set('training',flags) and not find_in_set('obsolete',flags)
                and target_code<>'' and preprocessed<>'' and type <> 'generated'
                order by id`,
                [this._language]);
        }

        return new QueryReadableAdapter(query);
    }

    async _transaction() {
        let orgId;
        if (this._options.approvedOnly) {
            orgId = null;

            const approvedKinds = (await schemaModel.getAllApproved(this._dbClient)).map((d) => d.kind);
            if (this._forDevices === null) {
                this._forDevices = approvedKinds;
            } else {
                const set = new Set(approvedKinds);
                this._forDevices = this._forDevices.filter((k) => set.has(k));
            }
        } else {
            const org = await orgModel.get(this._dbClient, this._options.owner);
            orgId = org.is_admin ? -1 : org.id;
        }

        if (this._forDevices !== null && this._forDevices.length > 0) {
            const escapedDevices = this._forDevices.map((d) => d.replace(/[.\\]/g, '\\$&')).join('|');
            const pat1 = ' @(' + escapedDevices + ')\\.[A-Za-z0-9_]+( |$)';
            const pat2 = ' device:(' + escapedDevices + ')( |$)';

            this._forDevicesPattern = '(' + pat1 + '|' + pat2 + ')';
            console.log(this._forDevicesPattern);
            this._forDevicesRegexp = new RegExp(this._forDevicesPattern);
        } else {
            this._forDevicesPattern = null;
            this._forDevicesRegexp = null;
        }

        this._tpClient = new AdminThingpediaClient(this._language, this._dbClient);
        this._schemas = new ThingTalk.SchemaRetriever(this._tpClient, null, !this._options.debug);

        const synthetic = await genSynthetic({
            dbClient: this._dbClient,
            language: this._language,
            orgId: orgId,
            templatePack: this._options.templatePack,

            flags: this._options.flags,
            maxDepth: this._options.maxDepth,
            debug: this._options.debug,
        });
        const paraphrase = this._downloadParaphrase();

        const source = StreamUtils.chain([paraphrase, synthetic], {
            objectMode: true
        });

        const constProvider = new DatabaseParameterProvider(this._language, this._dbClient);
        const ppdb = await Genie.BinaryPPDB.mapFile(this._options.ppdbFile);

        const augmenter = new Genie.DatasetAugmenter(this._schemas, constProvider, this._tpClient, {
            quotedProbability: this._options.quotedProbability,
            untypedStringProbability: 0,
            maxSpanLength: MAX_SPAN_LENGTH,
            ppdbProbabilitySynthetic: this._options.ppdbProbabilitySynthetic,
            ppdbProbabilityParaphrase: this._options.ppdbProbabilityParaphrase,
            syntheticExpandFactor: 1,
            paraphrasingExpandFactor: 30,
            noQuoteExpandFactor: 10,

            ppdbFile: ppdb,

            locale: this._language,
            rng: this._rng,
            debug: this._options.debug,
        });

        const train = new Genie.DatasetStringifier();
        const eval_ = new Genie.DatasetStringifier();
        const promises = [];
        promises.push(StreamUtils.waitFinish(train.pipe(this._options.train)));
        promises.push(StreamUtils.waitFinish(eval_.pipe(this._options.eval)));

        const splitter = new Genie.DatasetSplitter({
            rng: this._rng,
            locale: this._language,

            train,
            eval: eval_,

            evalProbability: this._options.evalProbability,
            forDevices: this._forDevices,
            splitStrategy: this._options.splitStrategy,
        });

        source.pipe(augmenter).pipe(splitter);
        await Promise.all(promises);
    }

    async run() {
        await db.withTransaction(async (dbClient) => {
            this._dbClient = dbClient;
            return this._transaction();
        }, 'repeatable read', 'read only');
    }
}


async function main() {
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Update Thingpedia Dataset'
    });
    parser.addArgument(['-l', '--language'], {
        required: true,
    });
    parser.addArgument('--owner', {
        type: Number,
        help: 'Organization ID of the model owner',
        required: true,
    });
    parser.addArgument('--template-file', {
        help: 'Template file to use',
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
    parser.addArgument(['--eval-probability'], {
        type: Number,
        help: 'Eval probability',
        defaultValue: 0.5,
    });
    parser.addArgument(['--split-strategy'], {
        help: 'Method to use to choose training and evaluation sentences',
        defaultValue: 'sentence',
        choices: ['id', 'raw-sentence', 'sentence', 'program', 'combination']
    });
    parser.addArgument(['-d', '--device'], {
        action: 'append',
        metavar: 'DEVICE',
        help: 'Restrict generation to command of the given device. This option can be passed multiple times to specify multiple devices',
        dest: 'forDevices',
    });
    parser.addArgument('--approved-only', {
        nargs: 0,
        action: 'storeTrue',
        help: 'Only consider approved devices.',
        defaultValue: false
    });
    parser.addArgument('--flag', {
        action: 'append',
        metavar: 'FLAG',
        help: 'Set a flag for the construct template file.',
        dest: 'flags',
        defaultValue: [],
    });
    parser.addArgument('--maxdepth', {
        type: Number,
        help: 'Maximum depth of synthetic sentence generation',
    });
    parser.addArgument('--ppdb', {
        defaultValue: './ppdb-2.0-m-lexical.bin',
        metavar: 'FILENAME',
        help: 'Path to the binary PPDB file',
    });
    parser.addArgument('--ppdb-synthetic-fraction', {
        type: Number,
        defaultValue: 0.1,
        metavar: 'FRACTION',
        help: 'Fraction of synthetic sentences to augment with PPDB',
    });
    parser.addArgument('--ppdb-paraphrase-fraction', {
        type: Number,
        defaultValue: 1.0,
        metavar: 'FRACTION',
        help: 'Fraction of paraphrase sentences to augment with PPDB',
    });
    parser.addArgument('--quoted-fraction', {
        type: Number,
        defaultValue: 0.1,
        metavar: 'FRACTION',
        help: 'Fraction of sentences that will not have their quoted parameters replaced',
    });
    parser.addArgument('--debug', {
        nargs: 0,
        action: 'storeTrue',
        help: 'Enable debugging.',
        defaultValue: false
    });
    parser.addArgument('--no-debug', {
        nargs: 0,
        action: 'storeFalse',
        dest: 'debug',
        help: 'Disable debugging.',
    });
    const args = parser.parseArgs();

    await platform.init();

    const generator = new DatasetGenerator(args.language, args.forDevices, {
        train: args.train,
        eval: args.eval,

        // generation flags
        owner: args.owner,
        approvedOnly: args.approved_only,
        flags: args.flags,
        maxDepth: args.maxdepth,
        templatePack: args.template_file,

        // augmentation flags
        ppdbFile: args.ppdb,
        ppdbProbabilitySynthetic: args.ppdb_synthetic_fraction,
        ppdbProbabilityParaphrase: args.ppdb_paraphrase_fraction,
        quotedProbability: args.quoted_fraction,

        // train/eval split flags
        evalProbability: args.eval_probability,
        splitStrategy: args.split_strategy,

        debug: args.debug
    });
    await generator.run();

    await db.tearDown();
}
main();

