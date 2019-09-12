// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const events = require('events');

const trainingJobModel = require('../model/training_job');
const modelsModel = require('../model/nlp_models');
const db = require('../util/db');

const Tasks = require('./tasks');
const JobSpecs = require('./job_specs');

class Task extends events.EventEmitter {
    constructor(jobId, jobDir, name) {
        super();
        this.jobId = jobId;
        this.jobDir = jobDir;
        this.name = name;

        // this is the base value of progress (from previous tasks)
        // used to convert task progress to job progress
        this._baseJobProgress = 0;
        this._progressUpdates = [];

        this.killed = false;
    }

    get language() {
        return this.info.language;
    }

    async load() {
        await db.withTransaction(async (dbClient) => {
            this.info = await trainingJobModel.get(dbClient, this.jobId);
            this.config = JSON.parse(this.info.config);

            const jobspec = JobSpecs[this.info.job_type];
            for (let task of jobspec) {
                if (task.name === this.name) {
                    this.spec = task;
                    break;
                }

                this._baseJobProgress += task.progress;
            }

            this.modelInfo = null;
            if (this.info.model_tag !== null) {
                this.modelInfo = (await modelsModel.getByTag(dbClient, this.language, this.info.model_tag))[0];
                if (!this.modelInfo) {
                    // the model was deleted since the job was scheduled, or some other weirdness
                    throw new Error('The model this job refers to no longer exists');
                }
            }

            this.forDevices = await trainingJobModel.readForDevices(dbClient, this.jobId);
        }, 'serializable', 'read only');
    }

    kill() {
        this.killed = true;
        this.emit('killed');
    }

    handleKill() {
        this.on('killed', () => {
            // die quietly if killed
            process.exit(0);
        });
    }

    async _save(keys) {
        await db.withClient((dbClient) => {
            const toSave = {};
            keys.forEach((k) => toSave[k] = this.info[k]);
            return trainingJobModel.update(dbClient, this.info.id, toSave);
        });
    }

    async setProgress(value) {
        // rescale task progress to job progress
        value = this._baseJobProgress + value * this.spec.progress;

        console.log(`Progress for job ${this.id}: ${Math.floor(value*100)}`);

        const now = new Date;
        this._progressUpdates.push([now, value]);
        if (this._progressUpdates.length > 3)
            this._progressUpdates.shift();
        if (this._progressUpdates.length === 3) {
            let speedSum = 0;
            for (let i = 1; i < this._progressUpdates.length; i++) {
                const timeDelta = this._progressUpdates[i][0].getTime() - this._progressUpdates[i-1][0].getTime();
                const stepDelta = this._progressUpdates[i][1] - this._progressUpdates[i-1][1];
                const speed = stepDelta / timeDelta;
                speedSum += speed;
            }
            const avgSpeed = speedSum / 2;

            let eta = Math.ceil(now.getTime() + (1 - value) / avgSpeed);

            // add 10 minutes to account for validation, uploading, etc.
            eta += 10 * 60 * 1000;

            this.info.eta = new Date(eta);
        }
        this.info.progress = value;
        return this._save(['progress', 'eta']);
    }
    async setMetrics(metrics) {
        this.info.metrics = JSON.stringify(metrics);
        return this._save(['metrics']);
    }
}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('run-training-task', {
            help: 'Run a training task',
        });

        parser.addArgument(['-t', '--task-name'], {
            help: 'The name of the task to run',
            choices: Object.keys(Tasks),
            required: true
        });

        parser.addArgument('--job-id', {
            help: 'The ID of the job to run',
            type: Number,
            required: true
        });
        parser.addArgument('--job-directory', {
            help: 'The directory where to save job specific files',
            required: true
        });

        parser.addArgument('--debug', {
            nargs: 0,
            action: 'storeTrue',
            help: 'Enable debugging.',
            defaultValue: false
        });
        parser.addArgument('--no-debug', {
            nargs: 0,
            action: 'storeFalse',
            dest: 'debug',
            help: 'Disable debugging.',
        });
    },

    async main(argv) {
        const task = new Task(argv.job_id, argv.job_directory, argv.task_name);
        await task.load();
        await task.setProgress(0);
        process.on('SIGINT', () => task.kill());
        process.on('SIGTERM', () => task.kill());

        await Tasks[argv.task_name](task, argv);

        await task.setProgress(1);
        await db.tearDown();
    }
};
