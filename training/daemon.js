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
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const assert = require('assert');
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
                await this._recordJobCompletion(dbClient, job);
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
        if (jobRow.status === 'error' && jobRow.error !== `Dependency failed` && jobRow.error !== `Killed`
            && jobRow.error !== 'The kubernetes job was deleted')
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

    _getJobConfig(jobTemplate, jobType, modelInfo) {
        if (jobTemplate.config)
            return JSON.stringify(jobTemplate.config);

        if (modelInfo)
            return modelInfo.config;

        // all other jobs are scheduled with a modelInfo or a custom config
        assert(jobType === 'update-dataset');

        // update-dataset ignores the config and uses hard-coded defaults that are appropriate
        // for a specific version of ThingTalk
        // this might change in the future, but it's good for now
        return '{}';
    }

    _jobTypeIsMergeable(jobType) {
        return jobType === 'train' || jobType === 'update-dataset';
    }

    async _queueOrMergeJob(dbClient, jobTemplate, jobType, modelInfo, dependsOn) {
        const config = this._getJobConfig(jobTemplate, jobType, modelInfo);
        assert(config);

        if (dependsOn === null && this._jobTypeIsMergeable(jobType)) {
            // if there is no dependency, check for an existing queued job for this type, language and model tag
            // if so, we add the forDevice to it and be done with it
            //
            // if there is a dependency, it's on a job that we just scheduled, so there is no sense
            // in merging with anything already in the queue (it would just delay whatever is already in the queue)
            //
            // note that this check ignores if the queued job depends on any other job,
            // which means the new job also gets the same dependencies
            // this is ok, because the queued job was scheduled first and should be executed first
            const queued = await trainingJobModel.getNextOfType(dbClient, jobType, jobTemplate.language, modelInfo ? modelInfo.tag : null);
            if (queued.length > 0) {
                if (queued.length > 1) {
                    // this should never happen, both because we only queue at most 1 job per (type, language, tag) tuple,
                    // and because the query has "limit 1"
                    console.error(`Unexpected result from trainingJobModel.getNextOfType, saw ${queued.length} queued jobs`);
                }

                const candidate = queued[0];
                if (candidate.config !== config) // update configuration
                    await trainingJobModel.update(dbClient, candidate.id, { config });

                if (candidate.all_devices)
                    return candidate.id;

                if (jobTemplate.forDevices === null)
                    await trainingJobModel.makeForAllDevices(dbClient, candidate.id);
                else
                    await trainingJobModel.addForDevices(dbClient, candidate.id, jobTemplate.forDevices);
                return candidate.id;
            }
        }

        // we did not merge, let's make a new job
        const newjob = await trainingJobModel.create(dbClient, {
            job_type: jobType,
            owner: jobTemplate.owner,
            language: jobTemplate.language,
            model_tag: modelInfo ? modelInfo.tag : null,
            config: config,
            depends_on: dependsOn,
            all_devices: jobTemplate.forDevices === null
        }, jobTemplate.forDevices || []);
        console.log(`Queued ${jobType} job ${newjob.id} for model @${modelInfo ? modelInfo.tag : null}/${jobTemplate.language}`);
        return newjob.id;
    }

    _getAffectedModels(dbClient, jobTemplate) {
        if (jobTemplate.modelTag)
            return modelsModel.getByTag(dbClient, jobTemplate.language, jobTemplate.modelTag);
        else if (jobTemplate.forDevices === null)
            return modelsModel.getForLanguage(dbClient, jobTemplate.language);
        else
            return modelsModel.getForDevices(dbClient, jobTemplate.language, jobTemplate.forDevices);
    }

    async scheduleJob(jobTemplate) {
        await db.withTransaction(async (dbClient) => {
            let forDevices = jobTemplate.forDevices;
            if (forDevices !== null && (!Array.isArray(forDevices) || forDevices.length === 0))
                throw new Error('forDevices must be an array of strings');
            if (typeof jobTemplate.language !== 'string' || !jobTemplate.language)
                throw new Error(`language must be specified and must be a string`);
            const jobType = jobTemplate.jobType;
            if (typeof jobType !== 'string' || !jobType)
                throw new Error(`jobType must be specified and must be a string`);

            const affectedModels = await this._getAffectedModels(dbClient, jobTemplate);

            if (jobType === 'train' || jobType === 'update-dataset,train') {
                let dependsOn = null;
                if (jobType === 'update-dataset,train') {
                    // there is only one dataset (per language) for all models, so we only queue
                    // one update-dataset job
                    dependsOn = await this._queueOrMergeJob(dbClient, jobTemplate, 'update-dataset', null, null);
                }

                for (let modelInfo of affectedModels) {
                    if (modelInfo.contextual) {
                        console.error(`FIXME: skipping training of contextual model ${jobTemplate.language}/${modelInfo.tag}`);
                        continue;
                    }
                    await this._queueOrMergeJob(dbClient, jobTemplate, 'train', modelInfo, dependsOn);
                }
            } else if (JOB_TYPES.includes(jobType)) {
                await this._queueOrMergeJob(dbClient, jobTemplate, jobType, null, null);
            } else {
                throw new Error(`Invalid job type ${jobType}`);
            }
        });

        this._startAll();
    }

    killJob(id) {
        return db.withTransaction(async (dbClient) => {
            const job = await trainingJobModel.getForUpdate(dbClient, id);
            if (job.status === 'started' && this._currentJobs[job.job_type] &&
                this._currentJobs[job.job_type].id === id) {
                this._currentJobs[job.job_type].kill();
            } else {
                job.status = 'error';
                job.error = 'Killed';
                await this._recordJobCompletion(dbClient, job);
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
                await this.scheduleJob(req.body);
                res.json({ result: 'ok' });
            } catch(e) {
                console.error(e);
                res.status(400).json({ error: e.message, code: e.code });
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
