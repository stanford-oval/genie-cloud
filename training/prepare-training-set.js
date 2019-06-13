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
const path = require('path');
const fs = require('fs');

const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const { parseFlags } = require('./flag_utils');
const DatabaseParameterProvider = require('./param_provider');

const db = require('../util/db');

const MAX_SPAN_LENGTH = 10;

// FIXME
const GENIE_FILE = path.resolve(path.dirname(module.filename), '../node_modules/genie-toolkit/languages/en/thingtalk.genie');

class ForDevicesFilter extends Stream.Transform {
    constructor(pattern) {
        super({
            readableObjectMode: true,
            writableObjectMode: true,
        });

        this._pattern = pattern;
    }

    _transform(ex, encoding, callback) {
        if (this._pattern.test(ex.target_code))
            this.push(ex);
        callback();
    }

    _flush(callback) {
        process.nextTick(callback);
    }
}

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
        if (forDevices !== null && forDevices.length > 0) {
            const escapedDevices = forDevices.map((d) => d.replace(/\./g, '\\.')).join('|');
            const pat1 = ' @(' + escapedDevices + ')\\.[A-Za-z0-9_]+( |$)';
            const pat2 = ' device:(' + escapedDevices + ')( |$)';

            this._forDevicesPattern = '(' + pat1 + '|' + pat2 + ')';
            console.log(this._forDevicesPattern);
            this._forDevicesRegexp = new RegExp(this._forDevicesPattern);
        } else {
            this._forDevicesPattern = null;
            this._forDevicesRegexp = null;
        }

        this._dbClient = null;
        this._tpClient = null;
        this._schemas = null;
        this._augmenter = null;
    }

    _genSynthetic() {
        const options = {
            thingpediaClient: this._tpClient,
            schemaRetriever: this._schemas,

            templateFile: GENIE_FILE,

            rng: this._rng,
            locale: this._language,
            flags: {
                turking: false,
                policies: true,
                remote_programs: true,
                aggregation: true,
                bookkeeping: true,
                triple_commands: true,
                configure_actions: true
            },
            maxDepth: this._options.maxDepth,
            debug: this._options.debug,
        };

        let generator = new Genie.BasicSentenceGenerator(options);
        if (this._forDevicesRegexp !== null) {
            let filter = new ForDevicesFilter(this._forDevicesRegexp);
            generator = generator.pipe(filter);
        }
        return generator;
    }

    _downloadParaphrase() {
        let query;
        if (this._forDevicesPattern !== null) {
            query = this._dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags)
                and target_code<>'' and preprocessed<>'' and type <> 'generated' and target_code rlike ?`,
                [this._language, this._forDevicesPattern]);
        } else {
            query = this._dbClient.query(`select id,flags,preprocessed,target_code from example_utterances
                use index (language_flags) where language = ? and find_in_set('training',flags)
                and target_code<>'' and preprocessed<>'' and type <> 'generated'`,
                [this._language]);
        }

        return new QueryReadableAdapter(query);
    }

    async _transaction() {
        this._tpClient = new AdminThingpediaClient(this._language, this._dbClient);
        this._schemas = new ThingTalk.SchemaRetriever(this._tpClient, null, !this._options.debug);

        const synthetic = this._genSynthetic();
        const paraphrase = this._downloadParaphrase();

        const source = Genie.StreamUtils.chain([paraphrase, synthetic], {
            objectMode: true
        });

        const constProvider = new DatabaseParameterProvider(this._language, this._dbClient);
        const ppdb = await Genie.BinaryPPDB.mapFile(this._options.ppdbFile);

        const augmenter = new Genie.DatasetAugmenter(this._schemas, constProvider, {
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
        promises.push(Genie.StreamUtils.waitFinish(train.pipe(this._options.train)));
        promises.push(Genie.StreamUtils.waitFinish(eval_.pipe(this._options.eval)));

        const splitter = new Genie.DatasetSplitter({
            rng: this._rng,
            locale: this._language,
            debug: false,

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
        }, 'serializable', 'read only');
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
        defaultValue: 0.1,
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
    parser.addArgument('--maxdepth', {
        type: Number,
        defaultValue: 4,
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

    const generator = new DatasetGenerator(args.language, args.forDevices, {
        train: args.train,
        eval: args.eval,

        maxDepth: args.maxdepth,

        ppdbFile: args.ppdb,
        ppdbProbabilitySynthetic: args.ppdb_synthetic_fraction,
        ppdbProbabilityParaphrase: args.ppdb_paraphrase_fraction,
        quotedProbability: args.quoted_fraction,

        evalProbability: args.eval_probability,
        splitStrategy: args.split_strategy,

        debug: args.debug
    });
    await generator.run();

    await db.tearDown();
}
main();

