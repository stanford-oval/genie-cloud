
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

const Config = require('../config');

let _instance;
class TrainingServer {
    constructor() {
        this._cache = new Map;
    }

    static get() {
        return _instance;
    }

    getCurrentJob() {
        if (!Config.TRAINING_URL)
            return Promise.resolve(null);
        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        return Tp.Helpers.Http.get(Config.TRAINING_URL + '/jobs/current', { auth }).then((response) => {
            let parsed = JSON.parse(response);
            return parsed;
        }).catch((e) => {
            // if the server is down return nothing
            if (e.code === 503 || e.code === 'EHOSTUNREACH' || e.code === 'ECONNREFUSED')
                return null;
            throw e;
        });
    }

    queue(language, device) {
        if (!Config.TRAINING_URL)
            return;

        if (device)
            this._cache.delete(language + '/' + device);
        else
            this._cache.clear();
        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        Tp.Helpers.Http.post(Config.TRAINING_URL + '/jobs/create', JSON.stringify({
            language: language,
            forDevices: device ? [device] : null
        }), { auth: auth, dataContentType: 'application/json' }).then((response) => {
            let parsed = JSON.parse(response);
            console.log('Successfully started training job ' + parsed.id);
        }).catch((err) => {
            console.error('Failed to start training job: ' + err.message);
        });
    }

    check(language, device) {
        const jobId = language + '/' + device;
        if (this._cache.has(jobId))
            return this._cache.get(jobId);

        if (!Config.TRAINING_URL)
            return Promise.resolve(null);
        let auth = Config.TRAINING_ACCESS_TOKEN ? `Bearer ${Config.TRAINING_ACCESS_TOKEN}` : null;
        let promise = Tp.Helpers.Http.get(Config.TRAINING_URL + '/jobs/' + jobId, { auth }).then((response) => {
            let parsed = JSON.parse(response);
            return parsed;
        }).catch((e) => {
            // if the server is down return nothing
            if (e.code === 503 || e.code === 'EHOSTUNREACH' || e.code === 'ECONNREFUSED')
                return null;
            if (e.code === 404)
                return null;
            throw e;
        }).then((v) => {
            setTimeout(() => this._cache.delete(jobId), 30000);
            return v;
        });
	this._cache.set(jobId, promise);
        return promise;
    }
}
_instance =  new TrainingServer();
module.exports = TrainingServer;
