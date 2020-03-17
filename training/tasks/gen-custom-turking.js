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

    constant_sample_size: 10,
    sampling_strategy: 'bySentence',
    function_black_list: [],
    function_high_value_list: [],
    function_white_list: undefined,
    compound_only: false,
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

    if (config.synthetic_flags.indexOf('turking') < 0)
        config.synthetic_flags.push('turking');

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
        turkingConstantSampleSize: config.constant_sample_size,
        turkingSamplingStrategy: config.sampling_strategy,
        turkingCompoundOnly: config.compound_only,

        turkingFunctionBlackList: new Set(config.function_black_list),
        turkingFunctionHighValueList: new Set(config.function_high_value_list),
        turkingFunctionWhiteList: config.function_white_list ? new Set(config.function_white_list) : undefined,
        // note: we don't support device white/black list: these don't make sense because you can choose
        // which devices to include in the synthetic set in the first place

        debug: argv.debug
    });
    await generator.run();
};
