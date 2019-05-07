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

const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const exampleModel = require('../model/example');
const entityModel = require('../model/entity');
const stringModel = require('../model/strings');

const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const { parseFlags, makeFlags } = require('./flag_utils');

const db = require('../util/db');

const MAX_SPAN_LENGTH = 10;

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


class DatabaseParameterProvider {
    constructor(language, dbClient) {
        this._language = language;
        this._dbClient = dbClient;
    }

    async _getStrings(stringType) {
        return stringModel.getValues(this._dbClient, stringType, this._language);
    }

    async _getEntities(entityType) {
        const rows = await entityModel.getValues(this._dbClient, entityType, this._language);
        return rows.map((e) => {
            return {
                preprocessed: e.entity_canonical,
                weight: 1.0
            };
        });
    }

    get(valueListType, valueListName) {
        switch (valueListType) {
        case 'string':
            return this._getStrings(valueListName);
        case 'entity':
            return this._getEntities(valueListName);
        default:
            throw new TypeError(`Unexpected value list type ${valueListType}`);
        }
    }
}

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

class DatabaseInserter extends Stream.Writable {
    constructor(language, dbClient) {
        super({
            objectMode: true,
            highWaterMark: 1000,
        });

        this._language = language;
        this._dbClient = dbClient;
        this._batch = [];
        this._replacedBatch = [];
    }

    async _insertBatch(examples, isReplaced) {
        if (isReplaced) {
            return exampleModel.createManyReplaced(this._dbClient, examples.map((ex) => {
                // remove replaced flag (it's implicit)
                ex.flags.replaced = false;
                return {
                    preprocessed: ex.preprocessed,
                    target_code: ex.target_code,
                    type: ex.type,
                    flags: makeFlags(ex.flags),
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
                    flags: makeFlags(ex.flags),
                    is_base: 0,
                    language: this._language
                };
            }));
        }
    }

    async _process(ex) {
        // if ex is a pure paraphrase example (with no augmentation of any sort)
        // then it is already in the dataset and we don't need to insert it again
        //
        // we get here because we pass "includeQuotedExample: true" to the augmenter
        // which allows us to use the same augmenter for both synthetic and paraphrase data
        if (!ex.flags.synthetic && !ex.flags.replaced && !ex.flags.augmented)
            return;

        if (ex.flags.replaced) {
            this._replacedBatch.push(ex);
            if (this._replacedBatch.length >= 1000) {
                await this._insertBatch(this._replacedBatch, true);
                this._replacedBatch.length = 0;
            }
        } else {
            this._batch.push(ex);
            if (this._batch.length >= 1000) {
                await this._insertBatch(this._batch, false);
                this._batch.length = 0;
            }
        }
    }

    _write(ex, encoding, callback) {
        this._process(ex).then(() => callback(), (err) => callback(err));
    }

    _final(callback) {
        Promise.all([
            this._batch.length > 0 ? this._insertBatch(this._batch, false) : Promise.resolve(),
            this._replacedBatch.length > 0 ? this._insertBatch(this._replacedBatch, true) : Promise.resolve(),
        ]).then(() => callback(), (err) => callback(err));
    }
}

class DatasetUpdater {
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

        const generator = new Genie.SentenceGenerator(options);
        const transform = new Stream.Transform({
            readableObjectMode: true,
            writableObjectMode: true,

            transform(ex, encoding, callback) {
                ex.type = 'generated';
                ex.flags.training = true;
                if (ex.depth <= 3)
                    ex.flags.exact = true;
                callback(null, ex);
            },

            flush(callback) {
                process.nextTick(callback);
            }
        });
        generator.pipe(transform).pipe(this._augmenter);
    }

    async _regenerateReplacedParaphrases() {
        let rows;
        if (this._options.regenerateAll) {
            rows = await db.selectAll(this._dbClient, `select flags,type,preprocessed,target_code from
                example_utterances use index (language_flags) where language = ?
                and type <> 'generated' and find_in_set('training', flags)`, [this._language]);
        } else {
            rows = await db.selectAll(this._dbClient, `select flags,type,preprocessed,target_code from
                example_utterances use index (language_type) where language = ?
                and find_in_set('training', flags) and type in (?)`, [this._language, this._options.regenerateTypes]);
        }

        // NOTE: we want to make sure we don't start too many transforms at once, as that will overwhelm
        // the mysql socket with both reads and writes and cause very inefficient use of memory
        // (in a process that is already straining the memory limits due to SentenceGenerator)
        // luckily, the transform pressure is determined by the writer side, not the reader side
        // hence, we won't be processing these rows until the writer is done with the previous mini-batch
        // this means we can just dump into the transform and let node deal with it

        console.log(`Loaded ${rows.length} rows`);
        for (let row of rows) {
            row.flags = parseFlags(row.flags);
            this._augmenter.write(row);
        }
        console.log(`Completed paraphrase dataset`);
    }

    async _transaction() {
        this._tpClient = new AdminThingpediaClient(this._language, this._dbClient);
        this._schemas = new ThingTalk.SchemaRetriever(this._tpClient, null, !this._options.debug);

        const constProvider = new DatabaseParameterProvider(this._language, this._dbClient);
        const ppdb = await Genie.BinaryPPDB.mapFile(this._options.ppdbFile);

        this._augmenter = new Genie.DatasetAugmenter(this._schemas, constProvider, {
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
            includeQuotedExample: true,
            debug: this._options.debug,
        });
        this._writer = this._augmenter.pipe(new DatabaseInserter(this._language, this._dbClient));

        if (this._forDevicesRegexp !== null) {
            let filter = new ForDevicesFilter(this._forDevicesRegexp);
            filter.pipe(this._augmenter);
            this._augmenter = filter;
        }

        if (this._options.regenerateAll || this._options.regenerateTypes.length > 0)
            await this._regenerateReplacedParaphrases();
        if (this._options.regenerateAll || this._options.regenerateTypes.length === 0)
            this._genSynthetic();
        else
            this._augmenter.end();

        await new Promise((resolve, reject) => {
            this._writer.on('finish', resolve);
            this._writer.on('error', reject);
        });
    }

    async run() {
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

    const updater = new DatasetUpdater(args.language, args.forDevices, {
        regenerateAll: args.all,
        regenerateTypes: args.types || [],
        maxDepth: args.maxdepth,

        ppdbFile: args.ppdb,
        ppdbProbabilitySynthetic: args.ppdb_synthetic_fraction,
        ppdbProbabilityParaphrase: args.ppdb_paraphrase_fraction,
        quotedProbability: args.quoted_fraction,
        
        debug: args.debug
    });
    await updater.run();

    await db.tearDown();
}
main();

