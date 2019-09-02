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
const fs = require('fs');
const path = require('path');
const util = require('util');
const child_process = require('child_process');
const byline = require('byline');

const Tp = require('thingpedia');

const db = require('../util/db');
const trainingJobModel = require('../model/training_job');

const Config = require('../config');

const DEFAULT_TRAINING_CONFIG = {
    synthetic_depth: 4,
    dataset_ppdb_probability_synthetic: 0.1,
    dataset_ppdb_probability_paraphrase: 1.0,
    dataset_quoted_probability: 0.1,
    dataset_eval_probability: 0.5,
    dataset_split_strategy: 'sentence'
};

function execCommand(job, script, argv) {
    return new Promise((resolve, reject) => {
        const stdio = ['ignore', 'pipe', 'pipe'];

        console.log(`${script} ${argv.map((a) => "'" + a + "'").join(' ')}`);
        const child = child_process.spawn(script, argv, { stdio, cwd: job.jobDir });
        job.child = child;
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            job.child = null;
            if (signal) {
                if (signal === 'SIGINT' || signal === 'SIGTERM')
                    reject(new Error(`Killed`));
                else
                    reject(new Error(`Command crashed with signal ${signal}`));
            } else {
                if (code !== 0)
                    reject(new Error(`Command exited with code ${code}`));
                else
                    resolve();
            }
        });

        child.stdio[1].setEncoding('utf-8');
        let stdout = byline(child.stdio[1]);
        stdout.on('data', (line) => {
            process.stdout.write(`job ${job.id}: ${line}\n`);
        });

        child.stdio[2].setEncoding('utf-8');
        let stderr = byline(child.stdio[2]);
        stderr.on('data', (line) => {
            process.stderr.write(`job ${job.id}: ${line}\n`);
        });
    });
}

function execTask(job, taskName) {
    const nodejs = process.execPath;
    const args = process.execArgv.concat([
        '--max_old_space_size=' + Config.TRAINING_MEMORY_USAGE,
        path.resolve(path.dirname(module.filename), '../main.js'),
        'run-training-task',
        '--task-name', taskName,
        '--job-id', job.id,
        '--job-directory', job.jobDir,
    ]);

    return execCommand(job, nodejs, args);
}

async function taskUpdatingDataset(job) {
    return execTask(job, 'update-dataset');
}

async function taskReloadingExact(job) {
    // reload the exact matches now that the synthetic set has been updated
    try {
        await Tp.Helpers.Http.post(Config.NL_SERVER_URL + `/admin/reload/exact/@${job.model_tag}/${job.language}?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`, '', {
            dataContentType: 'application/x-www-form-urlencoded'
        });
    } catch(e) {
        console.error(`Failed to ask server to reload exact matches: ${e.message}`);
    }
}

async function taskGenerateTrainingSet(job) {
    return execTask(job, 'prepare-training-set');
}

async function taskTraining(job) {
    return execTask(job, 'train');
}

async function taskUploading(job) {
    const modelLangDir = `${job.model_tag}:${job.language}`;
    const outputdir = path.resolve(job.jobDir, 'output');

    if (Config.NL_SERVER_URL === null)
        return;

    const INFERENCE_SERVER = Url.parse(Config.NL_SERVER_URL).hostname;
    if (Config.NL_MODEL_DIR) {
        await execCommand(job, 'aws', ['s3',
            'sync',
            job.s3outputdir,
            `${Config.NL_MODEL_DIR}/${modelLangDir}/`
        ]);
    } else {
        await execCommand(job, 'rsync', ['-rv',
            path.resolve(outputdir) + '/',
            INFERENCE_SERVER + `:${modelLangDir}/`
        ]);
    }

    await Tp.Helpers.Http.post(Config.NL_SERVER_URL + `/admin/reload/@${job.model_tag}/${job.language}?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`, '', {
        dataContentType: 'application/x-www-form-urlencoded'
    });
}

const TASKS = {
    'update-dataset': [taskUpdatingDataset, taskReloadingExact],
    'train': [taskGenerateTrainingSet, taskTraining, taskUploading]
};

function taskName(task) {
    let name;
    if (typeof task === 'function')
        name = task.name;
    else
        name = String(task);
    name = name.replace(/^task/, '').replace(/([a-z])([A-Z])/g, (_, one, two) => (one + '_' + two)).toLowerCase();
    return name;
}

module.exports = class Job {
    constructor(daemon, jobRow, forDevices, modelInfo) {
        this._daemon = daemon;
        this.data = jobRow;
        this._config = JSON.parse(this.data.config);
        this._metrics = JSON.parse(this.data.metrics);

        this._forDevices = forDevices;
        this._modelInfo = modelInfo;

        this._killed = false;
        this.child = null;
        this._allTasks = TASKS[this.data.job_type];

        this.jobDir = path.resolve('./jobs/' + this.id);
        this._progressUpdates = [];
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

    _currentTaskName() {
        return taskName(this._allTasks[this.data.task_index]);
    }

    async _doStart(dbClient) {
        this.data.start_time = new Date;
        this.data.status = 'started';

        const configFile = Config.TRAINING_CONFIG_FILE;
        const config = {};
        Object.assign(config, DEFAULT_TRAINING_CONFIG);
        if (configFile)
            Object.assign(config, JSON.parse(await util.promisify(fs.readFile)(configFile, { encoding: 'utf8' })));
        this._config = config;
        this.data.config = JSON.stringify(config);
        await trainingJobModel.update(dbClient, this.data.id, {
            start_time: this.data.start_time,
            status: this.data.status,
            config: this.data.config,
        });
    }

    async _doRun() {
        for (let i = 0; i < this._allTasks.length; i++) {
            if (this._killed)
                throw new Error(`Killed`);

            this.data.task_index = i;
            const taskName = this._currentTaskName();
            console.log(`Job ${this.data.id} is now ${taskName}`);
            this.data.task_name = taskName;
            this.data.progress = 0;
            await this._save(['task_index', 'task_name', 'progress']);

            const start = new Date();
            const task = this._allTasks[this.data.task_index];
            await task(this);
            const end = new Date();

            const duration = end - start;
            console.log(`Completed task ${taskName} in ${Math.round(duration/1000)} seconds`);

            await db.withClient((dbClient) => {
                return trainingJobModel.recordTask(dbClient, this.data.id, taskName, start, end);
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
            console.error(`Job ${this.data.id} failed during task ${this._currentTaskName()}: ${error}`);
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
    get forDevices() {
        return this._forDevices;
    }
    get model_tag() {
        return this.data.model_tag;
    }
    get modelInfo() {
        return this._modelInfo;
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
    get metrics() {
        return this._metrics;
    }
    setMetrics(v) {
        this._metrics = v;
        this.data.metrics = JSON.stringify(v);
        return this._save(['metrics']);
    }

    get status() {
        return this.data.status;
    }
    get error() {
        return this.data.error;
    }
    get eta() {
        return this.data.eta;
    }
    get progress() {
        return this.data.progress;
    }
    setProgress(value) {
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

            this.data.eta = new Date(eta);
        }
        this.data.progress = value;
        return this._save(['progress', 'eta']);
    }

};
