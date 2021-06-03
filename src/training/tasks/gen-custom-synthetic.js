// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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


const AbstractFS = require('../../util/abstract_fs');
const DatasetGenerator = require('../lib/dataset_generator');

const DEFAULT_TRAINING_CONFIG = {
    use_approved: false,
    synthetic_depth: 7,
    synthetic_flags: [],
    target_pruning_size: 10000,
};

module.exports = async function main(task, argv) {
    task.handleKill();

    await AbstractFS.mkdirRecursive(AbstractFS.resolve(task.jobDir));

    const config = {};
    // note that we include another step of setting default keys here so if we add new commandline
    // arguments to genienlp, or new dataset config keys, we can use them even though the models in the database
    // might not be updated
    Object.assign(config, DEFAULT_TRAINING_CONFIG);
    Object.assign(config, task.config);

    const generator = new DatasetGenerator(task, task.forDevices, {
        contextual: false, // TODO
        output: AbstractFS.createWriteStream(AbstractFS.resolve(task.jobDir, 'output.tsv'), true),

        // generation flags
        owner: config.owner,
        approvedOnly: config.use_approved,
        templatePack: config.template_file_name,
        maxDepth: config.synthetic_depth,
        flags: config.synthetic_flags,
        targetPruningSize: config.target_pruning_size,

        debug: argv.debug
    });
    await generator.run();
};
