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

const Tp = require('thingpedia');
const Genie = require('genie-toolkit');

const child_process = require('child_process');
const byline = require('byline');

const Config = require('../config');

const PPDB = process.env.PPDB || path.resolve('./ppdb-2.0-m-lexical.bin');

const DEFAULT_TRAINING_CONFIG = {
    synthetic_depth: 4
};

function delay(timeout) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, timeout);
    });
}

function addAll(array, add) {
    for (let elem of add) {
        if (array.indexOf(elem) < 0)
            array.push(elem);
    }
}

function execCommand(job, script, argv, handleStderr = null, extraEnv = {}) {
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
            if (handleStderr)
                handleStderr(line);
        });
    });
}

async function safeMkdir(dir, options) {
    try {
         await util.promisify(fs.mkdir)(dir, options);
    } catch(e) {
         if (e.code === 'EEXIST')
             return;
         throw e;
    }
}
function safeUnlinkSync(path) {
    try {
         fs.unlinkSync(path);
    } catch(e) {
         if (e.code === 'ENOENT')
             return;
         throw e;
    }
}

async function mkdirRecursive(dir) {
    const components = path.resolve(dir).split('/').slice(1);

    let subpath = '';
    for (let component of components) {
         subpath += '/' + component;
         await safeMkdir(subpath);
    }
}

async function taskPrepare(job) {
    await delay(0);
    job.jobDir = path.resolve('./jobs/' + job.id);
    await mkdirRecursive(job.jobDir);

    await mkdirRecursive(path.resolve(`./tensorboard/${job.modelTag}/${job.language}`));
    await mkdirRecursive(path.resolve(`./saved-model/${job.modelTag}/${job.language}`));
    await mkdirRecursive(path.resolve(`./dataset/${job.modelTag}/${job.language}`));

    await safeMkdir(path.resolve(job.jobDir, 'dataset'));
    await safeMkdir(path.resolve(job.jobDir, 'workdir'));
    await safeMkdir(path.resolve(job.jobDir, 'server'));

    safeUnlinkSync(path.resolve(`./dataset/${job.modelTag}/${job.language}/in-progress`));
    fs.symlinkSync(path.resolve(job.jobDir, 'dataset'), path.resolve(`./dataset/${job.modelTag}/${job.language}/in-progress`));
    safeUnlinkSync(path.resolve(`./tensorboard/${job.modelTag}/${job.language}/in-progress`));
    fs.symlinkSync(path.resolve(job.jobDir, 'workdir/model'), path.resolve(`./tensorboard/${job.modelTag}/${job.language}/in-progress`));
}

async function taskUpdatingDataset(job) {
    const script = process.execPath;

    const args = process.execArgv.concat([
        '--max_old_space_size=' + Config.TRAINING_MEMORY_USAGE,
        path.resolve(path.dirname(module.filename), './update-dataset.js'),
        '--language', job.language,
    ]);
    if (job.forDevices !== null) {
        for (let d of job.forDevices)
            args.push('--device', d);
    }

    await execCommand(job, script, args);
}

async function taskReloadingExact(job) {
    // reload the exact matches now that the synthetic set has been updated
    try {
        await Tp.Helpers.Http.post(Config.NL_SERVER_URL + `/admin/reload/exact/@${job.modelTag}/${job.language}?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`, '', {
            dataContentType: 'application/x-www-form-urlencoded'
        });
    } catch(e) {
        console.error(`Failed to ask server to reload exact matches: ${e.message}`);
    }
}

async function taskGenerateTrainingSet(job) {
    const script = process.execPath;

    const dataset = path.resolve(job.jobDir, 'dataset');
    const args = process.execArgv.concat([
        '--max_old_space_size=' + Config.TRAINING_MEMORY_USAGE,
        path.resolve(path.dirname(module.filename), './prepare-training-set.js'),
        '--language', job.language,
        '--owner', job.modelInfo.owner,
        '--template-file', job.modelInfo.template_file_name,
        '--train', path.resolve(dataset, 'train.tsv'),
        '--eval', path.resolve(dataset, 'eval.tsv'),
        '--maxdepth', job.config.synthetic_depth,
        '--ppdb', path.resolve(PPDB),
    ]);
    for (let d of job.modelInfo.for_devices)
        args.push('--device', d);
    for (let f of job.modelInfo.flags)
        args.push('--flag', f);
    if (job.modelInfo.use_approved)
        args.push('--approved-only');

    await execCommand(job, script, args);

    await util.promisify(fs.writeFile)(path.resolve(dataset, 'test.tsv'), '');
}

async function taskTraining(job) {
    const workdir = path.resolve(job.jobDir, 'workdir');
    const datadir = path.resolve(job.jobDir, 'dataset');
    const outputdir = path.resolve(job.jobDir, 'output');

    const genieJob = Genie.Training.createJob({
        id: job.id,
        backend: 'decanlp',
        config: job.config,
        thingpediaUrl: Url.resolve(Config.SERVER_ORIGIN, Config.THINGPEDIA_URL),
        debug: true,

        workdir,
        datadir,
        outputdir
    });
    // mirror the configuration into job so whatever default we're using now
    // is stored permanently for later analysis
    Object.assign(job.config, genieJob.config);

    genieJob.on('progress', (value) => {
        job.setProgress(value);
    });


    // set the genie job as child of this job
    // this way, when the job is killed, we'll call .kill()
    // on the genieJob as well (which in turn will
    job.child = genieJob;

    await genieJob.train();

    job.child = null;

    if (!job._killed)
        job.metrics = genieJob.metrics;
}

async function taskUploading(job) {
    const modelLangDir = `${job.modelTag}:${job.language}`;
    const outputdir = path.resolve(job.jobDir, 'output');

    const INFERENCE_SERVER = Url.parse(Config.NL_SERVER_URL).hostname;
    await execCommand(job, 'rsync', ['-rv',
        path.resolve(outputdir) + '/',
        INFERENCE_SERVER + `:${modelLangDir}/`
    ]);

    for (let what of ['saved-model', 'tensorboard', 'dataset']) {
        const current = path.resolve(`./${what}/${job.modelTag}/${job.language}/current`);
        try {
            fs.renameSync(current, path.resolve(`./${what}/${job.modelTag}/${job.language}/previous`));
        } catch(e) {
            // eat the error if the current path does not exist
            if (e.code !== 'ENOENT')
                throw e;
        }
    }

    fs.symlinkSync(outputdir, path.resolve(`./saved-model/${job.modelTag}/${job.language}/current`));

    fs.symlinkSync(path.resolve(job.jobDir, 'workdir/model'), path.resolve(`./tensorboard/${job.modelTag}/${job.language}/current`));
    safeUnlinkSync(path.resolve(`./tensorboard/${job.modelTag}/${job.language}/in-progress`));

    fs.symlinkSync(path.resolve(job.jobDir, 'dataset'), path.resolve(`./dataset/${job.modelTag}/${job.language}/current`));
    safeUnlinkSync(path.resolve(`./dataset/${job.modelTag}/${job.language}/in-progress`));

    await Tp.Helpers.Http.post(Config.NL_SERVER_URL + `/admin/reload/@${job.modelTag}/${job.language}?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`, '', {
        dataContentType: 'application/x-www-form-urlencoded'
    });
}

const TASKS = {
    'update-dataset': [taskUpdatingDataset, taskReloadingExact],
    'train': [taskPrepare, taskGenerateTrainingSet, taskTraining, taskUploading]
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
    constructor(daemon, id, jobType, forDevices, language, modelTag, dependsOn, modelInfo) {
        this._daemon = daemon;
        this.data = {
            id: id,
            jobType: jobType,
            forDevices: forDevices,
            language: language,
            modelTag: modelTag,
            startTime: null,
            endTime: null,
            taskIndex: 0,
            status: 'queued',
            progress: 0,
            eta: null,
            dependsOn: dependsOn,
            modelInfo: modelInfo,

            taskStats: {}
        };

        this._killed = false;
        this.child = null;
        this._allTasks = TASKS[this.data.jobType];

        this.jobDir = null;
        this.bestModelDir = null;
        this._progressUpdates = [];
    }

    static load(daemon, json) {
        const self = new Job(daemon);
        self.data = json;
        self._allTasks = TASKS[self.data.jobType];

        return self;
    }

    toJSON() {
        return this.data;
    }

    save() {
        return this._daemon.save();
    }

    start() {
        console.log(`Starting ${this.data.jobType} job ${this.data.id} for model @${this.data.modelTag}/${this.data.language}`);

        this._doStart().catch((err) => {
            this.fail(err);
        });
    }

    _currentTaskName() {
        return taskName(this._allTasks[this.data.taskIndex]);
    }

    async _doStart() {
        this.data.startTime = (new Date).toISOString();
        this.data.status = 'started';

        const configFile = Config.TRAINING_CONFIG_FILE;
        const config = {};
        Object.assign(config, DEFAULT_TRAINING_CONFIG);
        if (configFile)
            Object.assign(config, JSON.parse(await util.promisify(fs.readFile)(configFile, { encoding: 'utf8' })));
        this.data.config = config;
        await this.save();

        for (let i = 0; i < this._allTasks.length; i++) {
            if (this._killed)
                throw new Error(`Killed`);

            this.data.taskIndex = i;
            const taskName = this._currentTaskName();
            console.log(`Job ${this.data.id} is now ${taskName}`);
            this.data.status = taskName;
            this.data.progress = 0;
            await this.save();

            const start = new Date();
            const task = this._allTasks[this.data.taskIndex];
            await task(this);
            const end = new Date();

            const duration = end - start;
            console.log(`Completed task ${taskName} in ${Math.round(duration/1000)} seconds`);

            this.data.taskStats[taskName] = end - start;
            this._daemon.recordDuration(this, taskName, duration);
        }

        this.data.status = 'success';
        this.complete();
    }

    kill() {
        console.log(`Job ${this.data.id} killed`);
        this._killed = true;
        if (this.child)
            this.child.kill('SIGTERM');
    }

    fail(error) {
        if (this.data.status !== 'queued' && !this._killed) {
            console.error(`Job ${this.data.id} failed during task ${this._currentTaskName()}: ${error}`);
            if (error.stack)
                console.error(error.stack);
        }
        this.data.status = 'error';
        this.data.error = error.message;
        this.complete();
    }

    complete() {
        this.data.endTime = (new Date).toISOString();

        console.log(`Completed ${this.data.jobType} job ${this.data.id} for model @${this.data.modelTag}/${this.data.language}`);
        this._daemon.jobComplete(this);
    }

    get id() {
        return this.data.id;
    }
    get jobType() {
        return this.data.jobType;
    }
    get dependsOn() {
        return this.data.dependsOn;
    }

    get language() {
        return this.data.language;
    }
    get forDevices() {
        return this.data.forDevices;
    }
    get modelTag() {
        return this.data.modelTag;
    }
    get modelInfo() {
        return this.data.modelInfo;
    }

    addDevices(forDevices) {
        addAll(this.data.forDevices, forDevices);
        return this.save();
    }

    get startTime() {
        return this.data.startTime;
    }
    get endTime() {
        return this.data.endTime;
    }

    get config() {
        return this.data.config;
    }
    get metrics() {
        return this.data.metrics;
    }
    set metrics(v) {
        return this.data.metrics = v;
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
        return this.save();
    }

};
