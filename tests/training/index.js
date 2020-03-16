// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
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

    await server.queue('en', null, 'train');
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
            all_devices: 1,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{"synthetic_depth":2,"dataset_target_pruning_size":1000,"dataset_contextual_target_pruning_size":1000,"dataset_ppdb_probability_synthetic":0.1,"dataset_ppdb_probability_paraphrase":1,"dataset_quoted_probability":0.1,"dataset_eval_probability":0.5,"dataset_split_strategy":"sentence","train_iterations":10,"save_every":2,"val_every":2,"log_every":2,"trainable_decoder_embedding":10,"no_glove_decoder":true,"no_commit":true}',
            metrics: null,
            for_devices: []
        }, {
            id: 3,
            depends_on: 1,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.developer',
            all_devices: 1,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{"synthetic_depth":2,"dataset_target_pruning_size":1000,"dataset_contextual_target_pruning_size":1000,"dataset_ppdb_probability_synthetic":0.1,"dataset_ppdb_probability_paraphrase":1,"dataset_quoted_probability":0.1,"dataset_eval_probability":0.5,"dataset_split_strategy":"sentence","train_iterations":10,"save_every":2,"val_every":2,"log_every":2,"trainable_decoder_embedding":10,"no_glove_decoder":true,"no_commit":true}',
            metrics: null,
            for_devices: []
        }
    ]});

    await waitUntilAllJobsDone();
}

async function testForDevice() {
    const server = TrainingServer.get();

    // issue a train command for a device that is not approved

    await server.queue('en', ['org.thingpedia.builtin.test.adminonly'], 'train');
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
            all_devices: 0,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{"synthetic_depth":2,"dataset_target_pruning_size":1000,"dataset_contextual_target_pruning_size":1000,"dataset_ppdb_probability_synthetic":0.1,"dataset_ppdb_probability_paraphrase":1,"dataset_quoted_probability":0.1,"dataset_eval_probability":0.5,"dataset_split_strategy":"sentence","train_iterations":10,"save_every":2,"val_every":2,"log_every":2,"trainable_decoder_embedding":10,"no_glove_decoder":true,"no_commit":true}',
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
            all_devices: 0,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: '{"synthetic_depth":2,"dataset_target_pruning_size":1000,"dataset_contextual_target_pruning_size":1000,"dataset_ppdb_probability_synthetic":0.1,"dataset_ppdb_probability_paraphrase":1,"dataset_quoted_probability":0.1,"dataset_eval_probability":0.5,"dataset_split_strategy":"sentence","train_iterations":10,"save_every":2,"val_every":2,"log_every":2,"trainable_decoder_embedding":10,"no_glove_decoder":true,"no_commit":true}',
            metrics: null,
        }
    ]);

    const queue3 = await db.withClient((dbClient) =>
        trainingJobModel.getForDevice(dbClient, 'en', 'com.bing'));
    deepStrictEqual(queue3, []);

    await waitUntilAllJobsDone();
}

async function testDownload() {
    const root = await login('root', 'rootroot');

    await assertHttpError(sessionRequest('/luinet/models/download/en/org.thingpedia.foo', 'GET', null, root), 404);
    await assertHttpError(sessionRequest('/luinet/models/download/zh/org.thingpedia.models.default', 'GET', null, root), 404);

    const stream = await Tp.Helpers.Http.getStream(Config.SERVER_ORIGIN + '/luinet/models/download/en/org.thingpedia.models.default', {
        extraHeaders: {
            Cookie: root.cookie
        },
    });

    const parser = tar.list();
    const entries = [];
    await new Promise((resolve, reject) => {
        parser.on('entry', (entry) => {
            entries.push(entry.path);
        });
        parser.on('finish', resolve);
        stream.on('error', reject);
        parser.on('error', reject);

        stream.pipe(parser);
    });

    entries.sort();
    assert.deepStrictEqual(entries, ['best.pth', 'config.json']);
}

async function main() {
    await testBasic();
    await testForDevice();
    await testDownload();

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();
