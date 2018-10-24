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

const SendMail = require('../util/sendmail');
const db = require('../util/db');

const Job = require('./training_job');

const Config = require('../config');

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

The error reported was: ${job.error}.
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
            this.save();
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

    async loadExistingJobs() {
        await this._reloadModels();

        try {
            let data = fs.readFileSync('jobs.json');
            let parsed = JSON.parse(data);
            this._next_id = parsed.next_id || 0;
            this._last_job = parsed.last ? Job.load(this, parsed.last) : null;
            this._current_job = parsed.current ? Job.load(this, parsed.current) : null;
            this._next_jobs = (parsed.next || []).map((j) => Job.load(this, j));

            // we crashed so the current job necessarily failed
            if (this._current_job)
                this._current_job.fail(new Error('Master process failed'));
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
            if (req.query.access_token === Config.TRAINING_ACCESS_TOKEN) {
                next();
                return;
            }
            if (req.headers.authorization !== `Bearer ${Config.TRAINING_ACCESS_TOKEN}`) {
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
