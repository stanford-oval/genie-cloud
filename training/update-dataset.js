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

const stream = require('stream');
const seedrandom = require('seedrandom');
const argparse = require('argparse');
const path = require('path');

const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const exampleModel = require('../model/example');

const BinaryPPDB = require('../util/binary_ppdb');
const PPDBUtils = require('../util/ppdb');
const ParameterReplacer = require('./replace_parameters');
const AdminThingpediaClient = require('../util/admin-thingpedia-client');

const db = require('../util/db');

// FIXME
const GENIE_FILE = path.resolve(path.dirname(module.filename), '../node_modules/genie-toolkit/languages/en/thingtalk.genie');

// NOTE: to ensure consistency wrt concurrent database modifications by other processes,
// this script executes everything inside a single transaction
//
// this is quite dangerous: this transaction can last for minutes
// if another transaction tries to read a row that is locked by this one, it will timeout
// and be rolled back (which the calling code usually handles but it results in a 500 error
// and bad user experience)
//
// hence, in modifying this code you must pay attention to the semantics of InnoDB locking
// and SQL isolation modes
// to learn more, see: https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html#isolevel_repeatable-read
//
// specifically, we operate in READ COMMITTED mode
// this means that only the rows that we modify (insert/delete) are locked, and none of
// the reads apply any lock
// (MySQL's default is REPEATABLE READ, but our default is SERIALIZABLE, which is the only sane default)
//
// in turn, this means
// - if the database is concurrently modified, the dataset we generate might not correspond
//   to any consistent snapshot (instead, it will be a hybrid of before and after the modification)
//   this can cause TypeErrors as we try and load invalid templates, or it can cause invalid
//   sentences to be generated
//   this is acceptable because any database modification will queue a new update job and we'll
//   discard our work and start again
// - if two instances of the script run at once, they will insert all sentences twice, as they would delete the
//   same rows and then insert fresh rows to replace them
//   don't do that


class DatasetUpdater {
    constructor(language, forDevices, options) {
        this._language = language;
        this._options = options;
        this._rng = seedrandom.alea('almond is awesome');

        this._forDevices = forDevices;
        if (forDevices !== null && forDevices.length > 0) {
            const escapedDevices = forDevices.map((d) => d.replace('.', '\\.')).join('|');
            const pat1 = ' @(' + escapedDevices + ')\\.[A-Za-z0-9_]+( |$)';
            const pat2 = ' device:(' + escapedDevices + ')( |$)';

            this._forDevicesPattern = '(' + pat1 + '|' + pat2 + ')';
            console.log(this._forDevicesPattern);
            this._forDevicesRegexp = new RegExp(this._forDevicesPattern);
        } else {
            this._forDevicesPattern = null;
            this._forDevicesRegexp = null;
        }

        this._ppdb = null;
        this._paramReplacer = null;

        this._dbClient = null;
        this._tpClient = null;
        this._schemas = null;
    }

    async _clearExistingDataset() {
        if (this._options.regenerateAll) {
            await db.query(this._dbClient, `delete from replaced_example_utterances where language = ?`, [this._language]);
            await db.query(this._dbClient, `delete from example_utterances where language = ? and (type = 'generated' or
                find_in_set('augmented', flags))`, [this._language]);
        } else if (this._options.regenerateTypes.length > 0) {
            await db.query(this._dbClient, `delete from replaced_example_utterances where language = ?
                and type in (?)`, [this._language, this._options.regenerateTypes]);
            await db.query(this._dbClient, `delete from example_utterances where language = ? and
                type in (?) and find_in_set('augmented', flags)`,
                [this._language, this._options.regenerateTypes]);
        } else if (this._forDevicesPattern !== null) {
            await db.query(this._dbClient, `delete from replaced_example_utterances where language = ? and type = 'generated'
                and target_code rlike ?`, [this._language, this._forDevicesPattern]);
            await db.query(this._dbClient, `delete from example_utterances where language = ? and type = 'generated'
                and target_code rlike ?`, [this._language, this._forDevicesPattern]);
        } else {
            await db.query(this._dbClient, `delete from replaced_example_utterances where language = ? and type = 'generated'`, [this._language]);
            await db.query(this._dbClient, `delete from example_utterances where language = ? and type = 'generated'`, [this._language]);
        }

        console.log(`Dataset cleaned`);
    }

    async _insertExampleBatch(examples, isReplaced) {
        if (isReplaced) {
            return exampleModel.createManyReplaced(this._dbClient, examples.map((ex) => {
                return {
                    preprocessed: ex.preprocessed,
                    target_code: ex.target_code,
                    type: ex.type,
                    flags: ex.flags,
                    language: this._language
                };
            }));
        } else {
            return exampleModel.createMany(this._dbClient, examples.map((ex) => {
                return {
                    utterance: ex.preprocessed,
                    preprocessed: ex.preprocessed,
                    target_code: ex.target_code,
                    target_json: '',
                    type: ex.type,
                    flags: ex.flags,
                    is_base: 0,
                    language: this._language
                };
            }));
        }
    }

    _applyPPDB(examples, prob) {
        const output = [];

        for (let ex of examples) {
            const newex = PPDBUtils.apply(ex, this._ppdb, {
                probability: prob,
                debug: this._debug,
                rng: this._rng
            });
            if (newex)
                output.push(newex);
        }

        return output;
    }

    async _processMinibatch(syntheticExamples, flags, type, ppdbProb) {
        if (syntheticExamples.length === 0)
            return;

        if (!this._options.regenerateAll && this._forDevicesPattern !== null) {
            syntheticExamples = syntheticExamples.filter((o) => {
                return this._forDevicesRegexp.test(o.target_code);
            });
        }
        if (syntheticExamples.length === 0)
            return;

        syntheticExamples.forEach((o) => {
            delete o.id;
            if (type)
                o.type = type;
            if (flags)
                o.flags = flags;
            else
                o.flags = o.flags.replace(/(^|,)exact/, '');
            if (type === 'generated') {
                if (o.depth <= 2)
                    o.flags += ',exact';
                o.preprocessed = o.utterance;
            }
        });

        const ppdbExamples = this._applyPPDB(syntheticExamples, ppdbProb);

        if (type === 'generated')
            await this._insertExampleBatch(syntheticExamples, false);

        await Promise.all([
            this._insertExampleBatch(ppdbExamples, false),

            this._replaceParameters(syntheticExamples),
            this._replaceParameters(ppdbExamples)
        ]);
    }

    async _replaceParameters(examples) {
        const replaced = await Promise.all(examples.map((ex) => {
            return this._paramReplacer.process(ex);
        }));
        const flattened = [];
        for (let el of replaced)
            flattened.push(...el);

        return this._insertExampleBatch(flattened, true);
    }

    async _genSynthetic() {
        const options = {
            thingpediaClient: this._tpClient,
            schemaRetriever: this._schemas,

            templateFile: GENIE_FILE,

            rng: this._rng,
            locale: this._language,
            flags: {
                turking: false,
            },
            maxDepth: this._options.maxDepth,
            debug: false
        };

        const generator = new Genie.SentenceGenerator(options);
        const writer = new stream.Writable({
            objectMode: true,
            highWaterMark: 100,

            write: (obj, encoding, callback) => {
                this._processMinibatch([obj], 'synthetic,training', 'generated', this._options.ppdbProbabilitySynthetic).then(() => callback(null), (err) => callback(err));
            },
            writev: (objs, callback) => {
                this._processMinibatch(objs.map((o) => o.chunk), 'synthetic,training', 'generated', this._options.ppdbProbabilitySynthetic).then(() => callback(null), (err) => callback(err));
            }
        });
        generator.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }

    async _regenerateReplacedParaphrases() {
        let rows;
        if (this._options.regenerateAll) {
            rows = await db.selectAll(this._dbClient, `select id,flags,type,preprocessed,target_code from
                example_utterances use index (language_flags) where language = ?
                and type <> 'generated' and find_in_set('training', flags)`, [this._language]);
        } else {
            rows = await db.selectAll(this._dbClient, `select id,flags,type,preprocessed,target_code from
                example_utterances use index (language_type) where language = ?
                and find_in_set('training', flags) and type in (?)`, [this._language, this._options.regenerateTypes]);
        }

        console.log(`Loaded ${rows.length} rows`);
        for (let i = 0; i < rows.length; i += 1000) {
            console.log(i);
            const minibatch = rows.slice(i, i+1000);
            await this._processMinibatch(minibatch, null, null, this._options.ppdbProbabilityParaphrase);
        }
        console.log(`Completed paraphrase dataset`);
    }

    async _transaction() {
        this._tpClient = new AdminThingpediaClient(this._language, this._dbClient);
        this._schemas = new ThingTalk.SchemaRetriever(this._tpClient, null, !this._options.debug);

        this._paramReplacer = new ParameterReplacer(this._language, this._schemas, this._dbClient, {
            rng: this._rng,
            addFlag: false,
            quotedProbability: this._options.quotedProbability,
        });
        await this._paramReplacer.initialize();

        if (this._options.regenerateAll || this._options.regenerateTypes.length > 0)
            await this._regenerateReplacedParaphrases();
        if (this._options.regenerateTypes.length === 0)
            await this._genSynthetic();
    }

    async run() {
        this._ppdb = await BinaryPPDB.mapFile(this._options.ppdbFile);

        await db.withTransaction(async (dbClient) => {
            this._dbClient = dbClient;
            await this._clearExistingDataset();
        });
        await db.withTransaction(async (dbClient) => {
            this._dbClient = dbClient;
            return this._transaction();
        }, 'repeatable read');
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
    parser.addArgument(['-a', '--all'], {
        nargs: 0,
        action: 'storeTrue',
        help: 'Update all datasets, including paraphrased ones.'
    });
    parser.addArgument(['-t', '--type'], {
        action: 'append',
        metavar: 'TYPE',
        help: 'Update datasets of the given type.',
        dest: 'types',
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

    const args = parser.parseArgs();

    const updater = new DatasetUpdater(args.language, args.forDevices, {
        regenerateAll: args.all,
        regenerateTypes: args.types || [],
        maxDepth: args.maxdepth,

        ppdbFile: args.ppdb,
        ppdbProbabilitySynthetic: args.ppdb_synthetic_fraction,
        ppdbProbabilityParaphrase: args.ppdb_paraphrase_fraction,
        quotedProbability: args.quoted_fraction
    });
    await updater.run();

    await db.tearDown();
}
main();

