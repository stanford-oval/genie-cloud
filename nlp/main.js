#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;
process.on('unhandledRejection', (up) => { throw up; });

const express = require('express');
const path = require('path');

const logger = require('morgan');
const bodyParser = require('body-parser');
const errorHandler = require('errorhandler');
const cacheable = require('cacheable-middleware');
const Prometheus = require('prom-client');
const Genie = require('genie-toolkit');

const db = require('../util/db');
const Metrics = require('../util/metrics');
const I18n = require('../util/i18n');
const modelsModel = require('../model/nlp_models');

const NLPModel = require('./nlp_model');

const Config = require('../config');

class NLPInferenceServer {
    constructor() {
        this._models = new Map;
        this._tokenizer = new Genie.LocalTokenizer();
    }

    get tokenizer() {
        return this._tokenizer;
    }

    getModel(modelTag = 'default', locale) {
        const splitTag = locale.split(/[_.-]/g);

        while (splitTag.length > 0) {
            const key = `@${modelTag}/${splitTag.join('-')}`;
            const model = this._models.get(key);
            if (model)
                return model;
            splitTag.pop();
        }
        return undefined;
    }

    async loadAllLanguages() {
        await db.withTransaction(async (dbClient) => {
            const modelspecs = await modelsModel.getAll(dbClient);
            for (let modelspec of modelspecs) {
                const model = new NLPModel(modelspec.language, modelspec.tag, modelspec.owner, modelspec.access_token);
                await model.load(dbClient);
                this._models.set(model.id, model);
            }

            for (let locale of I18n.LANGS) {
                let language = locale.split('-')[0];
                const model = new NLPModel(language, 'default', null, null);
                await model.load(dbClient);
                this._models.set(model.id, model);
            }
        }, 'repeatable read');

        console.log(`Loaded ${this._models.size} models`);
    }

    initFrontend() {
        const app = express();

        app.service = this;
        app.set('port', process.env.PORT || 8400);
        app.set('views', path.join(__dirname, 'views'));
        app.set('view engine', 'pug');
        app.enable('trust proxy');
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(cacheable());

        // no logger in production!
        // otherwise all the mess with IRB to log what
        // people say goes down the drain...
        if ('development' === app.get('env')) {
            app.use(logger('dev'));
            app.use(errorHandler());
        }
        if (Config.ENABLE_PROMETHEUS)
            Metrics(app);

        app.use((req, res, next) => {
            res.set('Access-Control-Allow-Origin', '*');
            next();
        });

        app.use('/admin', require('./admin'));
        app.use(require('./query'));
        app.use(require('./learn'));

        app.use((err, req, res, next) => {
            console.error(err);
            res.status(500).json({ error: err.message });
        });

        app.listen(app.get('port'));
    }
}

function main() {
    const daemon = new NLPInferenceServer();

    daemon.loadAllLanguages();
    daemon.initFrontend();

    if (Config.ENABLE_PROMETHEUS)
        Prometheus.collectDefaultMetrics();
}
main();

