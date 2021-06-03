// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const AbstractFS = require('../../util/abstract_fs');
const DatasetGenerator = require('../lib/dataset_generator');

const DEFAULT_TRAINING_CONFIG = {
    synthetic_depth: 7,
    dataset_target_pruning_size: 5000,
    dataset_contextual_target_pruning_size: 1000,
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
        quotedProbability: config.dataset_quoted_probability,

        // train/eval split flags
        evalProbability: config.dataset_eval_probability,
        splitStrategy: config.dataset_split_strategy,

        debug: argv.debug
    });
    await generator.run();
};
