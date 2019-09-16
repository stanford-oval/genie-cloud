
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

const { InternalError } = require('./errors');

const Config = require('../config');

let _instance;
class TrainingServer {
    constructor() {
    }

    static get() {
        return _instance;
    }

    getCurrentJob() {
        if (!Config.TRAINING_URL)
            return Promise.resolve({});
        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        return Tp.Helpers.Http.get(Config.TRAINING_URL + '/jobs/current', { auth }).then((response) => {
            let parsed = JSON.parse(response);
            return parsed;
        }).catch((e) => {
            // if the server is down return nothing
            if (e.code === 503 || e.code === 'EHOSTUNREACH' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET') 
                return {};
            throw e;
        });
    }

    getJobQueue() {
        if (!Config.TRAINING_URL)
            return Promise.resolve({});
        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        return Tp.Helpers.Http.get(Config.TRAINING_URL + '/jobs', { auth }).then((response) => {
            let parsed = JSON.parse(response);
            return parsed;
        }).catch((e) => {
            // if the server is down return nothing
            if (e.code === 503 || e.code === 'EHOSTUNREACH' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET')
                return {};
            throw e;
        });
    }

    getMetrics() {
        if (!Config.TRAINING_URL)
            return Promise.resolve({});
        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        return Tp.Helpers.Http.get(Config.TRAINING_URL + '/jobs/metrics', { auth }).then((response) => {
            let parsed = JSON.parse(response);
            return parsed;
        }).catch((e) => {
            // if the server is down return nothing
            if (e.code === 503 || e.code === 'EHOSTUNREACH' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET')
                return {};
            throw e;
        });
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
            language, forDevices: null, modelTag, jobType,
        }), { auth: auth, dataContentType: 'application/json' }).then((response) => {
            let parsed = JSON.parse(response);
            console.log('Successfully started training job ' + parsed.id);
        });
    }

    check(language, device) {
        const jobId = language + '/' + device;

        if (!Config.TRAINING_URL)
            return Promise.resolve({});
        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        let promise = Tp.Helpers.Http.get(Config.TRAINING_URL + '/jobs/' + jobId, { auth }).then((response) => {
            let parsed = JSON.parse(response);
            return parsed;
        }).catch((e) => {
            // if the server is down return nothing
            if (e.code === 503 || e.code === 'EHOSTUNREACH' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET')
                return {};
            throw e;
        });
        return promise;
    }
}
_instance =  new TrainingServer();
module.exports = TrainingServer;
