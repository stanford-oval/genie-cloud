
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Tp = require('thingpedia');

const trainingJobModel = require('../model/training_job');
const { InternalError } = require('./errors');

const Config = require('../config');

let _instance;
class TrainingServer {
    constructor() {
    }

    static get() {
        return _instance;
    }

    async getJobQueue(dbClient) {
        const out = {};
        const jobs = await trainingJobModel.getQueue(dbClient);

        await Promise.all(jobs.map(async (job) => {
            job.for_devices = await trainingJobModel.readForDevices(dbClient, job.id);
        }));

        for (let job of jobs) {
            if (out[job.job_type])
                out[job.job_type].push(job);
            else
                out[job.job_type] = [job];
        }
        return out;
    }

    async getMetrics(dbClient) {
        const jobs = await trainingJobModel.getLastSuccessful(dbClient, 'train');
        if (jobs.length === 0)
            return {};

        const out = {};
        for (let job of jobs) {
            const key = job.model_tag + '/' + job.language;
            out[key] = JSON.parse(job.metrics);
        }
        return out;
    }

    kill(jobId) {
        if (!Config.TRAINING_URL)
            return Promise.resolve({});
        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        return Tp.Helpers.Http.post(Config.TRAINING_URL + '/jobs/kill', JSON.stringify({ id: jobId }), {
            dataContentType: 'application/json',
            auth,
        }).catch((err) => {
            // if the server is down eat the error
            if (err.code !== 503 && err.code !== 'EHOSTUNREACH' && err.code !== 'ECONNREFUSED' && err.code !== 'ECONNRESET')
                throw err;
        });
    }

    queue(language, forDevices, jobType) {
        if (!Config.TRAINING_URL)
            return Promise.resolve();

        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        return Tp.Helpers.Http.post(Config.TRAINING_URL + '/jobs/create', JSON.stringify({
            language, forDevices, jobType,
        }), { auth: auth, dataContentType: 'application/json' }).then((response) => {
            let parsed = JSON.parse(response);
            console.log('Successfully started training job ' + parsed.id);
        }).catch((err) => {
            console.error('Failed to start training job: ' + err.message);
            // if the server is down eat the error
            if (err.code !== 503 && err.code !== 'EHOSTUNREACH' && err.code !== 'ECONNREFUSED' && err.code !== 'ECONNRESET')
                throw err;
        });
    }

    queueModel(language, modelTag, jobType) {
        if (!Config.TRAINING_URL)
            throw new InternalError('E_INVALID_CONFIG', "Configuration error: Training server is not configured");

        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        return Tp.Helpers.Http.post(Config.TRAINING_URL + '/jobs/create', JSON.stringify({
            language, forDevices: [], modelTag, jobType,
        }), { auth: auth, dataContentType: 'application/json' }).then((response) => {
            let parsed = JSON.parse(response);
            console.log('Successfully started training job ' + parsed.id);
        });
    }
}
_instance =  new TrainingServer();
module.exports = TrainingServer;
