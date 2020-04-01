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

const path = require('path');

const AbstractFS = require('../../util/abstract_fs');
const DatasetGenerator = require('../lib/dataset_generator');

const PPDB = process.env.PPDB || path.resolve('./ppdb-2.0-m-lexical.bin');

const DEFAULT_TRAINING_CONFIG = {
    synthetic_depth: 7,
    dataset_target_pruning_size: 5000,
    dataset_contextual_target_pruning_size: 1000,
    dataset_ppdb_probability_synthetic: 0.1,
    dataset_ppdb_probability_paraphrase: 1.0,
    dataset_quoted_probability: 0.1,
    dataset_eval_probability: 0.5,
    dataset_split_strategy: 'sentence'
};

module.exports = async function main(task, argv) {
    task.handleKill();

    await AbstractFS.mkdirRecursive(AbstractFS.resolve(task.jobDir, 'dataset'));

    const modelInfo = task.modelInfo;
    const config = {};
    // note that we include another step of setting default keys here so if we add new commandline
    // arguments to genienlp, or new dataset config keys, we can use them even though the models in the database
    // might not be updated
    Object.assign(config, DEFAULT_TRAINING_CONFIG);
    Object.assign(config, task.config);

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
