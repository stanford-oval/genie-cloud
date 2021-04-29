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

require('../polyfill');
process.on('unhandledRejection', (up) => { throw up; });
require('../../util/config_init');
process.env.TEST_MODE = '1';

const assert = require('assert');
const tar = require('tar');
const Tp = require('thingpedia');

const db = require('../../util/db');
const sleep = require('../../util/sleep');
const trainingJobModel = require('../../model/training_job');
const TrainingServer = require('../../util/training_server');
const AbstractFS = require('../../util/abstract_fs');

const { assertHttpError, sessionRequest } = require('../website/scaffold');
const { login, } = require('../login');
const Config = require('../../config');

async function waitUntilAllJobsDone() {
    for (;;) {
        const row = await db.withClient((dbClient) => {
            return db.selectOne(dbClient,
                `select count(*) as cnt from training_jobs where status in ('started','queued')`);
        });
        console.log(row);
        if (row.cnt === 0)
            break;

        await sleep(10000);
    }

    const failed = await db.withClient((dbClient) => {
        return db.selectAll(dbClient,
            `select * from training_jobs where status = 'error'`);
    });
    assert.deepStrictEqual(failed, []);
}

async function cleanJob(jobId) {
    await AbstractFS.removeRecursive(AbstractFS.resolve(Config.TRAINING_DIR, './jobs/' + jobId));
}

function removeTimes(queue) {
    for (let jobType in queue) {
        for (let job of queue[jobType]) {
            job.start_time = null;
            job.end_time = null;

            // remove task_index/task_name too, as that could be racy
            job.task_index = null;
            job.task_name = null;
        }
    }
}

// a version of deepStrictEqual that works with RowDataPacket objects returned from mysql
function deepStrictEqual(a, b, ...args) {
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(a)),
        JSON.parse(JSON.stringify(b)),
        ...args);
}

async function testBasic() {
    const server = TrainingServer.get();

    // issue a basic train command

    await server.queue('en', null, 'update-dataset,train');
    await sleep(1000);

    const queue = await db.withClient((dbClient) => server.getJobQueue(dbClient));
    //console.log(queue);
    removeTimes(queue);

    deepStrictEqual(queue, {
        'update-dataset': [ {
            id: 1,
            depends_on: null,
            job_type: 'update-dataset',
            language: 'en',
            model_tag: null,
            owner: null,
            all_devices: 1,
            status: 'started',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{}',
            metrics: null,
            for_devices: [] }
        ],
        train: [ {
            id: 2,
            depends_on: 1,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.default',
            owner: null,
            all_devices: 1,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{"synthetic_depth": 3,"dataset_target_pruning_size": 1000,"dataset_contextual_target_pruning_size": 1000,"dataset_quoted_probability": 0.1,"dataset_eval_probability": 0.5,"dataset_split_strategy": "sentence","train_iterations": 12,"save_every": 6,"val_every": 3,"log_every": 3,"train_batch_tokens": 100,"val_batch_size": 100,"model": "TransformerSeq2Seq","pretrained_model": "sshleifer/bart-tiny-random","warmup": 40,"lr_multiply": 0.01}',
            metrics: null,
            for_devices: []
        }, {
            id: 3,
            depends_on: 1,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.developer',
            owner: null,
            all_devices: 1,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{"synthetic_depth": 3,"dataset_target_pruning_size": 1000,"dataset_contextual_target_pruning_size": 1000,"dataset_quoted_probability": 0.1,"dataset_eval_probability": 0.5,"dataset_split_strategy": "sentence","train_iterations": 12,"save_every": 6,"val_every": 3,"log_every": 3,"train_batch_tokens": 100,"val_batch_size": 100,"model": "TransformerSeq2Seq","pretrained_model": "sshleifer/bart-tiny-random","warmup": 40,"lr_multiply": 0.01}',
            metrics: null,
            for_devices: []
        }
    ]});

    await waitUntilAllJobsDone();

    // remove job directory to save disk space
    await cleanJob(2);
    await cleanJob(3);
}

async function testForDevice() {
    const server = TrainingServer.get();

    // issue a train command for a device that is not approved

    await server.queue('en', ['org.thingpedia.builtin.test.adminonly'], 'update-dataset,train');
    await sleep(1000);

    const queue = await db.withClient((dbClient) => server.getJobQueue(dbClient));
    //console.log(queue);
    removeTimes(queue);

    deepStrictEqual(queue, {
        'update-dataset': [ {
            id: 4,
            depends_on: null,
            job_type: 'update-dataset',
            language: 'en',
            model_tag: null,
            owner: null,
            all_devices: 0,
            status: 'started',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{}',
            metrics: null,
            for_devices: ['org.thingpedia.builtin.test.adminonly'] }
        ],
        train: [ {
            id: 5,
            depends_on: 4,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.developer',
            owner: null,
            all_devices: 0,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{"synthetic_depth": 3,"dataset_target_pruning_size": 1000,"dataset_contextual_target_pruning_size": 1000,"dataset_quoted_probability": 0.1,"dataset_eval_probability": 0.5,"dataset_split_strategy": "sentence","train_iterations": 12,"save_every": 6,"val_every": 3,"log_every": 3,"train_batch_tokens": 100,"val_batch_size": 100,"model": "TransformerSeq2Seq","pretrained_model": "sshleifer/bart-tiny-random","warmup": 40,"lr_multiply": 0.01}',
            metrics: null,
            for_devices: ['org.thingpedia.builtin.test.adminonly']
        }
    ]});

    const queue2 = await db.withClient((dbClient) =>
        trainingJobModel.getForDevice(dbClient,'en', 'org.thingpedia.builtin.test.adminonly'));
    for (let job of queue2) {
        job.start_time = null;
        job.end_time = null;
        job.task_index = null;
        job.task_name = null;
    }

    deepStrictEqual(queue2, [
        {
            id: 4,
            depends_on: null,
            job_type: 'update-dataset',
            language: 'en',
            model_tag: null,
            owner: null,
            all_devices: 0,
            status: 'started',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{}',
            metrics: null
        },
        {
            id: 5,
            depends_on: 4,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.developer',
            owner: null,
            all_devices: 0,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{"synthetic_depth": 3,"dataset_target_pruning_size": 1000,"dataset_contextual_target_pruning_size": 1000,"dataset_quoted_probability": 0.1,"dataset_eval_probability": 0.5,"dataset_split_strategy": "sentence","train_iterations": 12,"save_every": 6,"val_every": 3,"log_every": 3,"train_batch_tokens": 100,"val_batch_size": 100,"model": "TransformerSeq2Seq","pretrained_model": "sshleifer/bart-tiny-random","warmup": 40,"lr_multiply": 0.01}',
            metrics: null,
        }
    ]);

    const queue3 = await db.withClient((dbClient) =>
        trainingJobModel.getForDevice(dbClient, 'en', 'com.bing'));
    deepStrictEqual(queue3, []);

    await waitUntilAllJobsDone();

    // remove job directory to save disk space
    await cleanJob(5);
}

async function main() {
    await testBasic();
    await testForDevice();

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();
