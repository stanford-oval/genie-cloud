// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

const AbstractFS = require('../util/abstract_fs');
const db = require('../util/db');
const trainingJobModel = require('../model/training_job');

const Config = require('../config');

const JobSpecs = require('./job_specs');

module.exports = class Job {
    constructor(daemon, jobRow) {
        this._daemon = daemon;
        this.data = jobRow;
        this._config = JSON.parse(this.data.config);

        this._killed = false;
        this.child = null;
        this._allTasks = JobSpecs[this.data.job_type];
        this._backend = require('./backends/' + Config.TRAINING_TASK_BACKEND);

        this.jobDir = AbstractFS.resolve(Config.TRAINING_DIR, './jobs/' + this.id);
    }

    async _save(keys) {
        await db.withClient((dbClient) => {
            const toSave = {};
            keys.forEach((k) => toSave[k] = this.data[k]);
            return trainingJobModel.update(dbClient, this.data.id, toSave);
        });
    }

    async start(dbClient) {
        console.log(`Starting ${this.data.job_type} job ${this.data.id} for model @${this.data.model_tag}/${this.data.language}`);

        await this._doStart(dbClient);

        // do the rest asynchronously:
        // _doRun will resolve when the job is done,
        // start() resolves immediately to record that the job started
        this._doRun().catch((err) => {
            return this.fail(err);
        });
    }

    async _doStart(dbClient) {
        this.data.start_time = new Date;
        this.data.status = 'started';

        await trainingJobModel.update(dbClient, this.data.id, {
            start_time: this.data.start_time,
            status: this.data.status,
        });
    }

    async _doRun() {
        for (let i = 0; i < this._allTasks.length; i++) {
            if (this._killed)
                throw new Error(`Killed`);

            this.data.task_index = i;
            const taskSpec = this._allTasks[this.data.task_index];

            console.log(`Job ${this.data.id} is now ${taskSpec.name}`);
            this.data.task_name = taskSpec.name;
            this.data.progress = 0;
            await this._save(['task_index', 'task_name', 'progress']);

            const start = new Date();
            if (typeof taskSpec.task === 'function') {
                // local function task, run it
                await taskSpec.task(this);
            } else {
                // ask our backend to run this task
                this.child = await this._backend(this, taskSpec);
                await this.child.wait();
                this.child = null;
            }
            const end = new Date();

            const duration = end - start;
            console.log(`Completed task ${taskSpec.name} in ${Math.round(duration/1000)} seconds`);

            await db.withClient((dbClient) => {
                return trainingJobModel.recordTask(dbClient, this.data.id, taskSpec.name, start, end);
            });
        }
        if (this._killed)
            throw new Error(`Killed`);

        this.data.status = 'success';
        await this.complete();
    }

    kill() {
        console.log(`Job ${this.data.id} killed`);
        this._killed = true;
        if (this.child)
            this.child.kill('SIGTERM');
    }

    async fail(error) {
        if (this.data.status !== 'queued' && !this._killed) {
            console.error(`Job ${this.data.id} failed during task ${this.data.task_name}: ${error}`);
            if (error.stack)
                console.error(error.stack);
        }
        this.data.status = 'error';
        this.data.error = error.message;
        await this.complete();
    }

    async complete() {
        this.data.end_time = new Date;
        console.log(`Completed ${this.data.job_type} job ${this.data.id} for model @${this.data.model_tag}/${this.data.language}`);
        await this._daemon.jobComplete(this);
    }

    get id() {
        return this.data.id;
    }
    get job_type() {
        return this.data.job_type;
    }

    get language() {
        return this.data.language;
    }
    get model_tag() {
        return this.data.model_tag;
    }

    get startTime() {
        return this.data.start_time;
    }
    get endTime() {
        return this.data.end_time;
    }

    get config() {
        return this._config;
    }
    get status() {
        return this.data.status;
    }
    get error() {
        return this.data.error;
    }
};
