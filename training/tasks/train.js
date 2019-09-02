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

const Url = require('url');
const path = require('path');
const util = require('util');
const fs = require('fs');

const Genie = require('genie-toolkit');

const Config = require('../../config');
const GPUJob = require('./gpu_training_job');

module.exports = async function main(task, argv) {
    const workdir = path.resolve(task.jobDir, 'workdir');
    const datadir = path.resolve(task.jobDir, 'dataset');
    const outputdir = path.resolve(task.jobDir, 'output');

    // create a dummy test.tsv file to placate decanlp
    await util.promisify(fs.writeFile)(path.resolve(datadir, 'test.tsv'), '');

    const genieConfig = {};
    for (let key in task.config) {
        if (key.startsWith('dataset_'))
            continue;
        genieConfig[key] = task.config[key];
    }

    const options = {
        // do not pass the job ID to Genie, otherwise the lines will be prefixed twice
        backend: 'decanlp',
        config: genieConfig,
        thingpediaUrl: Url.resolve(Config.SERVER_ORIGIN, Config.THINGPEDIA_URL),
        debug: true,

        workdir,
        datadir,
        outputdir
    };

    let genieJob = null;
    if (Config.ENABLE_ON_DEMAND_GPU_TRAINING) {
        genieJob = new GPUJob(
            options,
            Config.GPU_REGION,
            Config.GPU_CLUSTER,
            Config.GPU_NODE_GROUP,
            Config.GPU_S3_WORKDIR,
            Config.GPU_SQS_REQUEST_URL,
            Config.GPU_SQS_RESPONSE_URL,
        );
        task.s3outputdir = genieJob.outputdir;
    } else {
        genieJob = Genie.Training.createJob(options);
    }

    genieJob.on('progress', (value) => {
        task.setProgress(value);
    });
    task.on('killed', () => {
        genieJob.kill();
    });

    await genieJob.train();

    if (!task.killed)
        await task.setMetrics(genieJob.metrics);
};
