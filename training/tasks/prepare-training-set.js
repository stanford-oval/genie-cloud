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

const Stream = require('stream');
const seedrandom = require('seedrandom');
const path = require('path');
const tmp = require('tmp-promise');
const fs = require('fs');
const byline = require('byline');

const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const AbstractFS = require('../../util/abstract_fs');
const BaseThingpediaClient = require('../../util/thingpedia-client');
const { parseFlags } = require('../../util/genie_flag_utils');
const StreamUtils = require('../../util/stream-utils');
const DatabaseParameterProvider = require('../lib/param_provider');
const genSynthetic = require('../sandboxed_synthetic_gen');

const schemaModel = require('../../model/schema');
const orgModel = require('../../model/organization');
const db = require('../../util/db');
const { coin } = require('../../util/random');

const PPDB = process.env.PPDB || path.resolve('./ppdb-2.0-m-lexical.bin');
const MAX_SPAN_LENGTH = 10;

class QueryReadableAdapter extends Stream.Readable {
    constructor(query, options) {
        super({ objectMode: true });

        query.on('result', (row) => {
            row.flags = parseFlags(row.flags);
            // mark a sentence for evaluation only if is exact and not synthetic,
            // which means it comes from the online dataset (developer data)

            if (row.flags.exact && !row.flags.synthetic && coin(options.evalProbability, options.rng))
                row.flags.eval = true;
            else
                row.flags.eval = false;
            row.flags.contextual = row.context !== null;
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

class TypecheckStream extends Stream.Transform {
    constructor(schemas) {
        super({ objectMode: true });

        this._schemas = schemas;
        this._dropped = 0;
    }

    async process(ex) {
        if (ex.flags.synthetic) {
            // skip typechecking synthetic examples, we know they are correct
            this.push(ex);
            return;
        }

        try {
            const entities = Genie.Utils.makeDummyEntities(ex.preprocessed);
            const program = ThingTalk.NNSyntax.fromNN(ex.target_code.split(' '), entities);
            await program.typecheck(this._schemas);
            this.push(ex);
            return;
        } catch(e) {
            this._dropped++;
        }
    }

    _transform(ex, encoding, callback) {
        this.process(ex).then(() => callback(), callback);
    }

    _flush(callback) {
        if (this._dropped > 0)
            console.error(`WARNING: dropped ${this._dropped} sentences after typechecking`);
        callback();
    }
}

class OrgThingpediaClient extends BaseThingpediaClient {
    constructor(locale, dbClient, org) {
        super(null, locale, dbClient);
        this._org = org;
    }

    async _getOrg(dbClient) {
        return this._org;
    }
}

class DatasetGenerator {
    constructor(task, forDevices, options) {
        this._task = task;
        this._language = task.language;
        this._options = options;
        this._contextual = options.contextual;

        this._rng = seedrandom.alea('almond is awesome');

        this._forDevices = forDevices;

        this._dbClient = null;
        this._tpClient = null;
        this._schemas = null;
        this._augmenter = null;
    }

    _downloadParaphrase(contextual) {
        const queryString = `select id,flags,preprocessed,context,target_code from example_utterances
            use index (language_flags) where language = ?
            and find_in_set('training',flags) and not find_in_set('obsolete',flags)
            and target_code<>'' and preprocessed<>'' and type <> 'generated'
            ${contextual ? ' and context is not null' : ' and context is null'}
            ${this._forDevicesPattern !== null ? ' and target_code rlike ?' : ''}
            order by id`;

        const query = this._dbClient.query(queryString, [this._language, this._forDevicesPattern]);
        return new QueryReadableAdapter(query, {
            evalProbability: this._options.evalProbability,
            rng: this._rng
        });
    }

    async _transaction() {
        let org;
        if (this._options.approvedOnly) {
            org = null;

            const approvedKinds = (await schemaModel.getAllApproved(this._dbClient)).map((d) => d.kind);
            if (this._forDevices === null) {
                this._forDevices = approvedKinds;
            } else {
                const set = new Set(approvedKinds);
                this._forDevices = this._forDevices.filter((k) => set.has(k));
            }
        } else {
            org = await orgModel.get(this._dbClient, this._options.owner);
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

        this._tpClient = new OrgThingpediaClient(this._language, this._dbClient, org);
        this._schemas = new ThingTalk.SchemaRetriever(this._tpClient, null, !this._options.debug);

        const tmpDir = await genSynthetic.prepare({
            dbClient: this._dbClient,
            language: this._language,
            orgId: await this._tpClient._getOrgId(),
            templatePack: this._options.templatePack,
        });

        // FIXME find a better place for this
        let basicFlags = this._options.flags.slice();
        if (this._contextual)
            basicFlags.push('no_contextual_bookkeeping');

        const basicSynthetic = genSynthetic.generate(tmpDir, {
            contextual: false,
            language: this._language,
            flags: basicFlags,
            maxDepth: this._options.maxDepth,
            targetPruningSize: this._options.targetPruningSize,
            debug: this._options.debug,
        });

        const basicParaphrase = this._downloadParaphrase(false)
            .pipe(new TypecheckStream(this._schemas));
        let source;

        if (this._contextual) {
            const contextualParaphrase = this._downloadParaphrase(true)
                .pipe(new TypecheckStream(this._schemas));

            const basicSource = StreamUtils.chain([basicParaphrase, basicSynthetic], { objectMode: true });

            // Spool the basic (non-contextual, not augmented) dataset to disk
            // We need to do this because:
            // 1) We don't want to run to many generation/processing steps as a pipeline, because that
            //    would use too much memory
            // 2) We need to do multiple passes over the basic dataset for different reasons, and
            //    we can't cache it in memory
            const { path: basicDataset, fd: basicDatasetFD } =
                await tmp.file({ mode: 0o600, dir: '/var/tmp' });

            await StreamUtils.waitFinish(basicSource
                .pipe(new Genie.DatasetStringifier())
                .pipe(fs.createWriteStream(basicDataset, { fd: basicDatasetFD })));
            // basicDatasetFD is closed here

            let contexts = await
                fs.createReadStream(basicDataset, { encoding: 'utf8' })
                .pipe(byline())
                .pipe(new Genie.DatasetParser({ contextual: false }))
                .pipe(new Genie.ContextExtractor(this._schemas))
                .read();

            const contextualized =
                fs.createReadStream(basicDataset, { encoding: 'utf8' })
                .pipe(byline())
                .pipe(new Genie.DatasetParser({ contextual: false }))
                .pipe(new Genie.Contextualizer(contexts, {
                    locale: this._language,
                    numSamples: 20,
                    nullOnly: false,
                }));

            const contextualSynthetic = genSynthetic.generate(tmpDir, {
                contextual: true,
                contexts,

                language: this._language,
                flags: this._options.flags,
                maxDepth: this._options.maxDepth,
                targetPruningSize: this._options.contextualTargetPruningSize,
                debug: this._options.debug,
            });

            // free memory
            contexts = null;


            // chain them in order of quality, from best to worst, because
            // dataset splitter will discard later examples if they look similar
            // to earlier ones
            // (same sentence or same program, depending on the options)
            source = StreamUtils.chain([contextualParaphrase, contextualized, contextualSynthetic],
                { objectMode: true });
        } else {
            // assume that the progress of synthetic generation is the overall progress, because
            // synthetic generation is the biggest part of the process, and augmentation happens in parallel
            basicSynthetic.on('progress', (value) => {
                this._task.setProgress(value).catch((e) => {
                    console.error(`Failed to update task progress: ${e.message}`);
                });
            });

            source = StreamUtils.chain([basicParaphrase, basicSynthetic], { objectMode: true });
        }

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
            singleDeviceExpandFactor: 3,

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

            // we use this._options.evalProbability to set the "eval" flag,
            // but all sentences with the eval flag should go in the eval set
            evalProbability: 1.0,
            forDevices: this._forDevices,
            splitStrategy: this._options.splitStrategy,
            useEvalFlag: true
        });

        source.pipe(augmenter).pipe(splitter);

        await Promise.all(promises);
    }

    async run() {
        await db.withTransaction(async (dbClient) => {
            this._dbClient = dbClient;

            const timeout = setInterval(() => {
                this._dbClient.ping((err) => {
                    if (err)
                        console.error(`Ignored error in PING to database: ` + err.message);
                });
            }, 60000);

            try {
                await this._transaction();
            } finally {
                clearInterval(timeout);
            }
        }, 'repeatable read', 'read only');
    }
}

module.exports = async function main(task, argv) {
    task.handleKill();

    await AbstractFS.mkdirRecursive(AbstractFS.resolve(task.jobDir, 'dataset'));

    const modelInfo = task.modelInfo;
    const config = task.config;

    const generator = new DatasetGenerator(task, modelInfo.for_devices, {
        contextual: modelInfo.contextual,

        train: AbstractFS.createWriteStream(AbstractFS.resolve(task.jobDir, 'dataset/train.tsv'), true),
        eval: AbstractFS.createWriteStream(AbstractFS.resolve(task.jobDir, 'dataset/eval.tsv'), true),

        // generation flags
        owner: modelInfo.owner,
        approvedOnly: modelInfo.use_approved,
        flags: modelInfo.flags,
        maxDepth: config.synthetic_depth,
        targetPruningSize: config.dataset_target_pruning_size,
        contextualTargetPruningSize: config.dataset_contextual_target_pruning_size,
        templatePack: modelInfo.template_file_name,

        // augmentation flags
        ppdbFile: PPDB,
        ppdbProbabilitySynthetic: config.dataset_ppdb_probability_synthetic,
        ppdbProbabilityParaphrase: config.dataset_ppdb_probability_paraphrase,
        quotedProbability: config.dataset_quoted_probability,

        // train/eval split flags
        evalProbability: config.dataset_eval_probability,
        splitStrategy: config.dataset_split_strategy,

        debug: argv.debug
    });
    await generator.run();
};
