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
const AbstractFS = require('../lib/abstract_fs');

const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const AdminThingpediaClient = require('../../util/admin-thingpedia-client');
const { parseFlags } = require('../lib/flag_utils');
const DatabaseParameterProvider = require('../lib/param_provider');
const StreamUtils = require('../lib/stream-utils');
const genSynthetic = require('../sandboxed_synthetic_gen');

const schemaModel = require('../../model/schema');
const orgModel = require('../../model/organization');
const db = require('../../util/db');

const PPDB = process.env.PPDB || path.resolve('./ppdb-2.0-m-lexical.bin');
const MAX_SPAN_LENGTH = 10;

class QueryReadableAdapter extends Stream.Readable {
    constructor(query) {
        super({ objectMode: true });

        query.on('result', (row) => {
            row.flags = parseFlags(row.flags);
            // mark a sentence for evaluation only if is exact and not synthetic,
            // which means it comes from the online dataset (developer data)
            row.flags.eval = row.flags.exact && !row.flags.synthetic;
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
        const entities = Genie.Utils.makeDummyEntities(ex.preprocessed);
        const program = ThingTalk.NNSyntax.fromNN(ex.target_code.split(' '), entities);

        try {
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
        const typecheck = new TypecheckStream(this._schemas);

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
            useEvalFlag: true
        });

        source.pipe(typecheck).pipe(augmenter).pipe(splitter);
        await Promise.all(promises);
    }

    async run() {
        await db.withTransaction(async (dbClient) => {
            this._dbClient = dbClient;
            return this._transaction();
        }, 'repeatable read', 'read only');
    }
}

module.exports = async function main(task, argv) {
    await AbstractFS.mkdirRecursive(task.jobDir);

    const modelInfo = task.modelInfo;
    const config = task.config;

    task.on('killed', () => {
        // die quietly if killed
        process.exit(0);
    });

    const generator = new DatasetGenerator(task.language, modelInfo.for_devices, {
        train: AbstractFS.createWriteStream(path.resolve(task.jobDir, 'dataset/train.tsv')),
        eval: AbstractFS.createWriteStream(path.resolve(task.jobDir, 'dataset/eval.tsv')),

        // generation flags
        owner: modelInfo.owner,
        approvedOnly: modelInfo.use_approved,
        flags: modelInfo.flags,
        maxDepth: config.synthetic_depth,
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
