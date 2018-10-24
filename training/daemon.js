// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Url = require('url');
const assert = require('assert');
const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('morgan');
const bodyParser = require('body-parser');
const errorHandler = require('errorhandler');
const child_process = require('child_process');
const byline = require('byline');

const SendMail = require('../util/sendmail');
const db = require('../util/db');

const Config = require('../config');

const ACCESS_TOKEN = Config.TRAINING_ACCESS_TOKEN;

function addAll(array, add) {
    for (let elem of add) {
        if (array.indexOf(elem) < 0)
            array.push(elem);
    }
}

function nonEmptyIntersection(one, two) {
    for (let el of one) {
        if (two.indexOf(el) >= 0)
            return true;
    }
    return false;
}

function taskTrain(job) {
    try {
        const args = [job.id, job.language, job.modelTag];
        if (job.forDevices !== null)
            args.push(job.forDevices.map((d) => '--device ' + d));
        else
            args.push('');
        if (job.modelTag !== 'default')
            args.push(this._models[job.modelTag].map((d) => '--device ' + d));
        else
            args.push('');
        const script = path.resolve(path.dirname(module.filename), 'train.sh');

        const env = {};
        Object.assign(env, process.env);
        env.LUINET_PATH = path.resolve(process.cwd(), Config.LUINET_PATH);
        env.NL_SERVER_ADMIN_TOKEN = Config.NL_SERVER_ADMIN_TOKEN;
        env.INFERENCE_SERVER = Url.parse(Config.NL_SERVER_URL).hostname;
        env.THINGPEDIA_URL = Url.resolve(Config.SERVER_ORIGIN, Config.THINGPEDIA_URL);
        const child = child_process.spawn(script, args, {
            stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
            env: env
        });
        child.on('error', (err) => {
            console.error(`Failed to launch job ${job.id}: ${err}`);
            job.fail(job, err.message);
        });
        child.on('exit', () => {
            console.log(`Completed job ${job.id}`);
            job.taskComplete();
        });
        child.stdio[3].setEncoding('utf-8');
        let pipe = byline(child.stdio[3]);
        pipe.on('data', (line) => {
            line = line.trim();
            if (line.startsWith('eta:')) {
                let eta = parseFloat(line.substring('eta:'.length));
                console.log(`ETA for job ${job.id}: ${eta} seconds`);

                let now = Date.now() / 1000;
                let endTime = now + eta;
                // round to whole minutes
                endTime = 60*Math.ceil(endTime / 60);
                job.setEta((new Date(endTime * 1000)).toISOString());
            } else if (line.startsWith('progress:')) {
                let [progress, n_epochs] = line.substring('progress:'.length).split('/');
                job.progress = parseInt(progress)/parseInt(n_epochs);
                job.setProgress((`Progress for job ${job.id}: ${Math.floor(job.progress*100)}`));
            } else {
                console.log(`Job ${job.id} is now ${line}`);
                job.setStatus(line);
            }
        });
    } catch(err) {
        console.error(`Failed to launch job ${job.id}: ${err}`);
        job.fail(err.message);
    }
}

const TASKS = [
    taskTrain,
];

class Job {
    constructor(daemon, id, forDevices, language, modelTag) {
        this._daemon = daemon;
        this.data = {
            id: id,
            forDevices: forDevices,
            language: language,
            modelTag: modelTag,
            startTime: null,
            endTime: null,
            taskIndex: 0,
            status: 'queued',
            progress: 0,
            eta: null,
        };
    }

    static load(daemon, json) {
        const self = new Job(daemon);
        self.data = json;
        return self;
    }

    toJSON() {
        return this.data;
    }

    save() {
        return this._daemon.save();
    }

    start() {
        this.data.startTime = (new Date).toISOString();
        this.data.status = 'started';

        console.log(`Starting job ${this.data.id} for model @${this.data.modelTag}/${this.data.language}`);

        this._startNextTask();
    }

    _startNextTask() {
        const task = TASKS[this.data.taskIndex];
        task(this);
        this.save();
    }

    taskComplete() {
        this.data.taskIndex ++;
        if (this.data.taskIndex < TASKS.length)
            this._startNextTask();
        else
            this.complete();
    }

    fail(error) {
        this.data.status = 'error';
        this.data.error = error;
        this.complete();
    }

    complete() {
        this.data.endTime = (new Date).toISOString();
        this._daemon.jobComplete(this);
    }

    get id() {
        return this.data.id;
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

    get progress() {
        return this.data.progress;
    }
    setProgress(value) {
        this.data.progress = value;
        return this.save();
    }

    get status() {
        return this.data.status;
    }
    setStatus(value) {
        this.data.status = value;
        this.data.progress = 0;
        return this.save();
    }

    get eta() {
        return this.data.eta;
    }
    setEta(value) {
        this.data.eta = value;
        return this.save();
    }
}

class TrainingDaemon {
    constructor() {
        this._last_job = null;
        this._current_job = null;
        this._next_jobs = [];
        this._next_id = 0;

        this._models = {};
    }

    async _reloadModels() {
        const rows = await db.withClient((dbClient) => {
            return db.selectAll(dbClient, `select * from models`);
        });
        const result = {};
        for (let row of rows)
            result[row.tag] = JSON.parse(row.for_devices);
        this._models = result;
    }

    save() {
        fs.writeFileSync('jobs.json', JSON.stringify({
            next_id: this._next_id,
            last: this._last_job,
            current: this._current_job,
            next: this._next_jobs
        }));
    }

    jobComplete(job) {
        if (job !== this._current_job)
            return;

        if (job.status === 'failed' || job.status === 'error') {
            const mailOptions = {
                from: 'Almond Training Service <almond-nntraining@parmesan.stanford.edu>',
                to: 'thingpedia-admins@lists.stanford.edu',
                subject: `Training Job ${job.id} failed`,
                text: `Training Job ${job.id}, for devices [${job.forDevices.join(', ')}], failed.
    Check the logs for further information.`
            };
            SendMail.send(mailOptions).catch((e) => {
                console.error(`Failed to send notification email: ${e.message}`);
            });
        }

        fs.appendFileSync('jobs_history', JSON.stringify(this._current_job) + '\n');
        this._last_job = this._current_job;
        this._current_job = this._next_jobs.shift() || null;
        if (this._current_job)
            this._startJob(this._current_job);
        else
            this._saveToDisk();
    }

    _startJob(job) {
        this._current_job = job;
        job.start();
    }

    _queueOrMergeJob(forDevices, language, modelTag) {
        if (this._current_job === null) {
            assert(this._next_jobs.length === 0);
            let newjob = new Job(this, this._next_id++,
                forDevices, language, modelTag);
            this._startJob(newjob);
            return newjob.id;
        } else {
            for (let candidate of this._next_jobs) {
                if (candidate.language === language &&
                    candidate.modelTag === modelTag) {
                    candidate.addDevices(forDevices);
                    return candidate.id;
                }
            }
            let newjob = new Job(this, this._next_id++,
                forDevices, language, modelTag);
            console.log(`Queued job ${newjob.id} for model @${modelTag}/${language}`);
            this._next_jobs.push(newjob);
            newjob.save();
            return newjob.id;
        }
    }

    loadExistingJobs() {
        try {
            let data = fs.readFileSync('jobs.json');
            let parsed = JSON.parse(data);
            this._next_id = parsed.next_id || 0;
            this._last_job = parsed.last ? Job.load(this, parsed.last) : null;
            this._current_job = parsed.current ? Job.load(this, parsed.current) : null;
            this._next_jobs = (parsed.next || []).map((j) => Job.load(this, j));

            // we crashed so the current job necessarily failed
            if (this._current_job) {
                this._current_job.status = 'error';
                this._current_job.error = 'Master process failed';
                this._jobComplete(this._current_job);
            }
        } catch(e) {
            if (e.code === 'ENOENT')
                return;
            throw e;
        }
    }

    async scheduleJob(jobTemplate) {
        let forDevices = jobTemplate.forDevices;
        let language = jobTemplate.language;
        if (!language)
            language = 'en';

        await this._reloadModels();

        if (forDevices === null) {
            // queue all models
            this._queueOrMergeJob([], language, 'default');
            for (let modelTag in this._models)
                this._queueOrMergeJob([], language, modelTag);
        } else {
            if (!Array.isArray(forDevices))
                throw new TypeError('forDevices must be an array of strings');

            // queue the default job always
            this._queueOrMergeJob(forDevices, language, 'default');

            // check if any of the other models are impacted
            // by this device
            for (let modelTag in this._models) {
                let modelDevices = this._models[modelTag];
                if (nonEmptyIntersection(modelDevices, forDevices))
                    this._queueOrMergeJob(forDevices, language, modelTag);
            }
        }
    }

    initFrontend() {
        const app = express();

        app.set('port', process.env.PORT || 8090);
        app.set('views', path.join(__dirname, 'views'));
        app.set('view engine', 'pug');
        app.enable('trust proxy');
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));

        app.use(logger('dev'));
        if ('development' === app.get('env'))
            app.use(errorHandler());

        app.use((req, res, next) => {
            if (req.query.access_token === ACCESS_TOKEN) {
                next();
                return;
            }
            if (req.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
                res.status(401).json({error:'Not Authorized'});
                return;
            }
            next();
        });

        app.post('/jobs/create', async (req, res, next) => {
            try {
                let id = await this.scheduleJob(req.body);
                res.json({result:'scheduled', id: id });
            } catch(e) {
                res.status(400).json({error: e.message, code: e.code});
            }
        });
        app.get('/jobs', (req, res) => {
            let jobs = [];
            if (this._current_job)
                jobs.push(this._current_job);
            jobs.push(...this._next_jobs);
            res.json({
                jobs
            });
        });
        app.get('/jobs/last', (req, res) => {
            res.json(this._last_job);
        });
        app.get('/jobs/current', (req, res) => {
            res.json(this._current_job);
        });
        app.get('/jobs/:language/:forDevice', (req, res) => {
            if (this._current_job === null) {
                res.status(404).json({ error: 'No job queued for ' + req.params.language + '/' + req.params.forDevice });
                return;
            }

            if (this._current_job.language === req.params.language && this._current_job.forDevices.some((d) => d === req.params.forDevice)) {
                res.json(this._current_job);
                return;
            }

            for (let candidate of this._next_jobs) {
                if (candidate.language === req.params.language && candidate.forDevices.some((d) => d === req.params.forDevice)) {
                    res.json(candidate);
                    return;
                }
            }

            res.status(404).json({ error: 'No job queued for ' + req.params.language + '/' + req.params.forDevice });
        });
        app.use((err, req, res, next) => {
            console.error(err);
            res.status(500).json({ error: err.message });
        });

        app.listen(app.get('port'));
    }
}

function main() {
    const daemon = new TrainingDaemon();

    daemon.loadExistingJobs();
    daemon.initFrontend();
}
main();
