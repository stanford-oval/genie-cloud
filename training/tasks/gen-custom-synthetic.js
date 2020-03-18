// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const AbstractFS = require('../../util/abstract_fs');
const DatasetGenerator = require('../lib/dataset_generator');

const DEFAULT_TRAINING_CONFIG = {
    use_approved: false,
    synthetic_depth: 4,
    synthetic_flags: [],
    target_pruning_size: 100000,
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
