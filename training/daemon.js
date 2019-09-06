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

const express = require('express');
const path = require('path');

const logger = require('morgan');
const bodyParser = require('body-parser');
const Prometheus = require('prom-client');

const SendMail = require('../util/sendmail');
const db = require('../util/db');
const Metrics = require('../util/metrics');
const modelsModel = require('../model/nlp_models');
const trainingJobModel = require('../model/training_job');
const errorHandling = require('../util/error_handling');

const Job = require('./training_job');

const Config = require('../config');

const JobSpecs = require('./job_specs');
const JOB_TYPES = Object.keys(JobSpecs);

class TrainingDaemon {
    constructor() {
        this._currentJobs = {};
    }

    async checkExistingJobs() {
        await db.withTransaction(async (dbClient) => {
            const existing = await trainingJobModel.getAllInProgress(dbClient);

            for (let job of existing) {
                job.status = 'error';
                job.error = 'Master process failed';
                await this._recordJobCompletion(job);
            }
        });

        this._startAll();
    }

    _startAll() {
        setImmediate(() => {
            for (let jobType of JOB_TYPES)
                this._startNextJob(jobType);
        });
    }

    async _notifyFailure(job) {
        const mailOptions = {
            from: Config.EMAIL_FROM_TRAINING,
            to: Config.EMAIL_TO_ADMIN,
            subject: `Training Job ${job.id} failed`,
            text: `Training Job ${job.id}, of type ${job.job_type} (@${job.modelTag}/${job.language}), failed.

The error reported was: ${job.error}.
Check the logs for further information.`
        };
        try {
            await SendMail.send(mailOptions);
        } catch (e) {
            console.error(`Failed to send notification email: ${e.message}`);
        }
    }

    async _recordJobCompletion(dbClient, jobRow) {
        if (jobRow.status === 'error' && jobRow.error !== `Dependency failed` && jobRow.error !== `Killed`)
            await this._notifyFailure(jobRow);

        await trainingJobModel.update(dbClient, jobRow.id, {
            status: jobRow.status,
            error: jobRow.error,
            end_time: jobRow.end_time
        });

        // if the job failed, recursively fail all dependencies
        if (jobRow.status === 'error') {
            const dependencies = await trainingJobModel.getDependents(dbClient, jobRow.id);
            await Promise.all(dependencies.map((dep) => {
                dep.status = 'error';
                dep.error = 'Dependency failed';
                return this._recordJobCompletion(dbClient, dep);
            }));
        }

        // remove the dependency now that this job completed
        await trainingJobModel.releaseDependents(dbClient, jobRow.id);
    }

    async jobComplete(job) {
        const current = this._currentJobs[job.job_type];
        // nobody likes races
        if (job !== current)
            return;

        this._currentJobs[job.job_type] = undefined;
        await db.withTransaction((dbClient) => {
            return this._recordJobCompletion(dbClient, job.data);
        });

        // outside the transaction, try starting the next job of all types
        // if there is already something running, or no job queued, startNextJob will be a noop
        this._startAll();
    }

    _startNextJob(jobType) {
        if (this._currentJobs[jobType])
            return;

        db.withTransaction(async (dbClient) => {
            const rows = await trainingJobModel.getNextJob(dbClient, jobType);
            if (rows.length === 0) // no more jobs of this type queued
                return;

            const next = rows[0];

            // check for races
            if (this._currentJobs[jobType])
                return;

            this._currentJobs[jobType] = new Job(this, next);
            await this._currentJobs[jobType].start(dbClient);
        }); // no catch: on error, crash the process
    }

    async _queueOrMergeJob(dbClient, forDevices, job_type, language, model_tag, depends_on) {
        if (depends_on === null) {
            // if there is no dependency, check for an existing queued job for this type, language and model tag
            // if so, we add the forDevice to it and be done with it
            //
            // if there is a dependency, it's on a job that we just scheduled, so there is no sense
            // in merging with anything already in the queue (it would just delay whatever is already in the queue)
            //
            // note that this check ignores if the queued job depends on any other job,
            // which means the new job also gets the same dependencies
            // this is ok, because the queued job was scheduled first and should be executed first
            const queued = await trainingJobModel.getNextOfType(dbClient, job_type, language, model_tag);
            if (queued.length > 0) {
                const candidate = queued[0];
                if (candidate.all_devices)
                    return candidate.id;

                if (forDevices === null)
                    await trainingJobModel.makeForAllDevices(dbClient, candidate.id);
                else
                    await trainingJobModel.addForDevices(dbClient, candidate.id, forDevices);
                return candidate.id;
            }
        }

        // we did not merge, let's make a new job
        const newjob = await trainingJobModel.create(dbClient, {
            job_type,
            language,
            model_tag,
            depends_on,
            all_devices: forDevices === null
        }, forDevices || []);
        console.log(`Queued ${job_type} job ${newjob.id} for model @${model_tag}/${language}`);
        return newjob.id;
    }

    _getAffectedModels(dbClient, language, jobTemplate) {
        if (jobTemplate.modelTag)
            return modelsModel.getByTag(dbClient, language, jobTemplate.modelTag);
        else if (jobTemplate.forDevices === null)
            return modelsModel.getForLanguage(dbClient, language);
        else
            return modelsModel.getForDevices(dbClient, language, jobTemplate.forDevices);
    }

    async scheduleJob(jobTemplate) {
        await db.withTransaction(async (dbClient) => {
            let forDevices = jobTemplate.forDevices;
            if (forDevices !== null && (!Array.isArray(forDevices) || forDevices.length === 0))
                throw new Error('forDevices must be an array of strings');
            let language = jobTemplate.language || 'en';
            let jobType = jobTemplate.jobType || 'train';

            const affectedModels = await this._getAffectedModels(dbClient, language, jobTemplate);

            if (jobType === 'train' || jobType === 'train-only') {
                let dependsOn = null;
                if (jobType !== 'train-only') {
                    // there is only one dataset (per language) for all models, so we only queue
                    // one update-dataset job
                    dependsOn = await this._queueOrMergeJob(dbClient, forDevices, 'update-dataset',
                        language, null, null);
                }

                for (let modelInfo of affectedModels)
                    await this._queueOrMergeJob(dbClient, forDevices, 'train', language, modelInfo.tag, dependsOn);
            } else if (jobType === 'update-dataset') {
                await this._queueOrMergeJob(dbClient, forDevices, 'update-dataset', language, null, null);
            } else {
                throw new Error(`Invalid job type ${jobType}`);
            }
        });

        this._startAll();
    }

    killJob(id) {
        return db.withTransaction(async (dbClient) => {
            const job = await trainingJobModel.getForUpdate(dbClient, id);
            if (job.status === 'started' && this._currentJobs[job.job_types] &&
                this._currentJobs[job.job_types].id === id) {
                this._currentJobs[job.job_types].kill();
            } else {
                job.status = 'error';
                job.error = 'Killed';
                await this._recordJobCompletion(job);
            }
        });
    }

    initFrontend(port) {
        const app = express();

        app.set('port', port);
        app.set('views', path.join(__dirname, 'views'));
        app.set('view engine', 'pug');
        app.enable('trust proxy');
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));

        app.use(logger('dev'));
        if (Config.ENABLE_PROMETHEUS)
            Metrics(app);

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

        app.post('/jobs/create', async (req, res, next) => { //'
            try {
                let id = await this.scheduleJob(req.body);
                res.json({result:'scheduled', id: id });
            } catch(e) {
                console.error(e);
                res.status(400).json({error: e.message, code: e.code});
            }
        });
        app.post('/jobs/kill', (req, res, next) => {
            const id = req.body.id;
            this.killJob(id).then(() => {
                res.json({result:'killed'});
            }).catch(next);
        });

        app.use('/', (req, res) => {
            res.status(404).json({ error: 'Invalid endpoint' });
        });
        app.use(errorHandling.json);

        app.listen(app.get('port'));
    }
}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('run-training', {
            description: 'Run the training controller process'
        });
        parser.addArgument(['-p', '--port'], {
            required: false,
            type: Number,
            help: 'Listen on the given port',
            defaultValue: 8090
        });
    },

    async main(argv) {
        const daemon = new TrainingDaemon();

        await daemon.checkExistingJobs();
        daemon.initFrontend(argv.port);

        if (Config.ENABLE_PROMETHEUS)
            Prometheus.collectDefaultMetrics();
    }
};
