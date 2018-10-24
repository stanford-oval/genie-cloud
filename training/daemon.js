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

const Config = require('../config');

const ACCESS_TOKEN = Config.TRAINING_ACCESS_TOKEN;

const MODELS = Config.TRAINING_MODELS || {};

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

class TrainingDaemon {
    constructor() {
        this._last_job = null;
        this._current_job = null;
        this._next_jobs = [];
        this._next_id = 0;
    }

    _saveToDisk() {
        fs.writeFileSync('jobs.json', JSON.stringify({
            next_id: this._next_id,
            last: this._last_job,
            current: this._current_job,
            next: this._next_jobs
        }));
    }

    _jobComplete(job) {
        job.endTime = (new Date).toISOString();

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
            SendMail.send(mailOptions);
        }

        fs.appendFileSync('jobs_history', JSON.stringify(this._current_job) + '\n');
        this._last_job = this._current_job;
        this._current_job = this._next_jobs.shift() || null;
        if (this._current_job)
            this._startJob(this._current_job);
        else
            this._saveToDisk();
    }

    _handleProgress(job, line) {
        if (line.startsWith('eta:')) {
            let eta = parseFloat(line.substring('eta:'.length));
            console.log(`ETA for job ${job.id}: ${eta} seconds`);

            let now = Date.now() / 1000;
            let endTime = now + eta;
            // round to whole minutes
            endTime = 60*Math.ceil(endTime / 60);
            job.eta = (new Date(endTime * 1000)).toISOString();
        } else if (line.startsWith('progress:')) {
            let [progress, n_epochs] = line.substring('progress:'.length).split('/');
            job.progress = parseInt(progress)/parseInt(n_epochs);
            console.log(`Progress for job ${job.id}: ${Math.floor(job.progress*100)}`);
        } else {
            console.log(`Job ${job.id} is now ${line}`);
            job.status = line;
            job.progress = 0;
        }
        this._saveToDisk();
    }

    _startJob(job) {
        this._current_job = job;
        this._current_job.startTime = (new Date).toISOString();
        this._current_job.status = 'started';

        console.log(`Starting job ${job.id} for model @${job.modelTag}/${job.language}`);
        try {
            const args = [job.id, job.language, job.modelTag];
            if (job.modelTag !== 'default')
                args.push(...MODELS[job.modelTag]);
            const script = path.resolve(path.dirname(module.filename), 'train-one.sh');

            const child = child_process.spawn(script, args, {
                stdio: ['ignore', 'inherit', 'inherit', 'pipe']
            });
            child.on('error', (err) => {
                console.error(`Failed to launch job ${job.id}: ${err}`);
                job.status = 'error';
                this._jobComplete(job);
            });
            child.on('exit', () => {
                console.log(`Completed job ${job.id}`);
                this._jobComplete(job);
            });
            child.stdio[3].setEncoding('utf-8');
            let pipe = byline(child.stdio[3]);
            pipe.on('data', (data) => {
                this._handleProgress(job, data.trim());
            });
        } catch(err) {
            console.error(`Failed to launch job ${job.id}: ${err}`);
            job.status = 'error';
            this._jobComplete(job);
        }

        this._saveToDisk();
    }

    _queueOrMergeJob(forDevices, language, modelTag) {
        if (this._current_job === null) {
            assert(this._next_jobs.length === 0);
            let newjob = {
                id: this._next_id++,
                forDevices: forDevices,
                language: language,
                modelTag: modelTag,
                startTime: null,
                endTime: null,
                status: 'not_started',
                progress: 0,
                eta: null,
            };
            this._startJob(newjob);
            return newjob.id;
        } else {
            for (let candidate of this._next_jobs) {
                if (candidate.language === language &&
                    candidate.modelTag === modelTag) {
                    addAll(candidate.forDevices, forDevices);
                    this._saveToDisk();
                    return candidate.id;
                }
            }
            let newjob = {
                id: this._next_id++,
                forDevices: forDevices,
                language: language,
                modelTag: modelTag,
                startTime: null,
                endTime: null,
                status: 'queued',
                progress: 0,
                eta: null,
            };
            console.log(`Queued job ${newjob.id} for model @${modelTag}/${language}`);
            this._next_jobs.push(newjob);
            this._saveToDisk();
            return newjob.id;
        }
    }

    loadExistingJobs() {
        try {
            let data = fs.readFileSync('jobs.json');
            let parsed = JSON.parse(data);
            this._next_id = parsed.next_id || 0;
            this._last_job = parsed.last || null;
            this._current_job = parsed.current || null;
            this._next_jobs = parsed.next || [];

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

    scheduleJob(jobTemplate) {
        let forDevices = jobTemplate.forDevices;
        let language = jobTemplate.language;
        if (!language)
            language = 'en';

        if (forDevices === null) {
            // queue all models
            this._queueOrMergeJob([], language, 'default');
            for (let modelTag in MODELS)
                this._queueOrMergeJob([], language, modelTag);
        } else {
            if (!Array.isArray(forDevices))
                throw new TypeError('forDevices must be an array of strings');

            // queue the default job always
            this._queueOrMergeJob(forDevices, language, 'default');

            // check if any of the other models are impacted
            // by this device
            for (let modelTag in MODELS) {
                let modelDevices = MODELS[modelTag];
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

        app.post('/jobs/create', (req, res) => {
            try {
                let id = this.scheduleJob(req.body);
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

        app.listen(app.get('port'));
    }
}

function main() {
    const daemon = new TrainingDaemon();

    daemon.loadExistingJobs();
    daemon.initFrontend();
}
main();
