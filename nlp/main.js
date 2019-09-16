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

const express = require('express');
const path = require('path');

const logger = require('morgan');
const bodyParser = require('body-parser');
const cacheable = require('cacheable-middleware');
const Prometheus = require('prom-client');
const Genie = require('genie-toolkit');

const db = require('../util/db');
const Metrics = require('../util/metrics');
const errorHandling = require('../util/error_handling');
const modelsModel = require('../model/nlp_models');
const I18n = require('../util/i18n');

const NLPModel = require('./nlp_model');
const FrontendClassifier = require('./classifier');
const ExactMatcher = require('./exact');

const Config = require('../config');

class NLPInferenceServer {
    constructor() {
        this._models = new Map;
        this._exactMatchers = new Map;
        this._classifier = new FrontendClassifier();
        this._tokenizer = new Genie.LocalTokenizer(Config.NL_TOKENIZER_ADDRESS);
    }

    get tokenizer() {
        return this._tokenizer;
    }

    get frontendClassifier() {
        return this._classifier;
    }

    getExact(locale) {
        const splitTag = locale.split(/[_.-]/g);

        while (splitTag.length > 0) {
            const matcher = this._exactMatchers.get(splitTag.join('-'));
            if (matcher)
                return matcher;
            splitTag.pop();
        }
        return undefined;
    }

    getModel(modelTag = 'org.thingpedia.models.default', locale) {
        const splitTag = locale.split(/[_.-]/g);

        // API compat
        if (modelTag === 'default')
            modelTag = 'org.thingpedia.models.default';

        while (splitTag.length > 0) {
            const key = `@${modelTag}/${splitTag.join('-')}`;
            const model = this._models.get(key);
            if (model)
                return model;
            splitTag.pop();
        }
        return undefined;
    }

    getOrCreateModel(spec) {
        const key = `@${spec.tag}/${spec.language}`;
        let model = this._models.get(key);
        if (model) {
            model.init(spec, this);
            return model;
        }

        model = new NLPModel(spec, this);
        this._models.set(key, model);
        return model;
    }

    async loadAllLanguages() {
        await this._classifier.start();

        await db.withTransaction(async (dbClient) => {
            for (let locale of Config.SUPPORTED_LANGUAGES) {
                const language = I18n.localeToLanguage(locale);
                const matcher = new ExactMatcher(language);
                this._exactMatchers.set(language, matcher);
                await matcher.load(dbClient);
            }

            const modelspecs = await modelsModel.getAll(dbClient);
            for (let modelspec of modelspecs) {
                const model = new NLPModel(modelspec, this);
                await model.load();
                this._models.set(model.id, model);
            }
        }, 'repeatable read', 'read only');

        console.log(`Loaded ${this._models.size} models`);
    }

    initFrontend(port) {
        const app = express();

        app.service = this;
        app.set('port', port);
        app.set('views', path.join(__dirname, 'views'));
        app.set('view engine', 'pug');
        app.enable('trust proxy');
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(cacheable());

        // no logger in production!
        // otherwise all the mess with IRB to log what
        // people say goes down the drain...
        if ('development' === app.get('env'))
            app.use(logger('dev'));
        if (Config.ENABLE_PROMETHEUS)
            Metrics(app);

        app.use((req, res, next) => {
            res.set('Access-Control-Allow-Origin', '*');
            next();
        });

        app.use('/admin', require('./admin'));
        app.use(require('./query'));
        app.use(require('./learn'));

        // if we get here, we have a 404 error
        app.use('/', (req, res) => {
            res.status(404).json({ error: 'Invalid endpoint' });
        });
        app.use(errorHandling.json);

        app.listen(app.get('port'));
    }
}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('run-nlp', {
            description: 'Run the NLP inference process'
        });
        parser.addArgument(['-p', '--port'], {
            required: false,
            type: Number,
            help: 'Listen on the given port',
            defaultValue: 8400
        });
    },

    main(argv) {
        const daemon = new NLPInferenceServer();

        daemon.loadAllLanguages();
        daemon.initFrontend(argv.port);

        if (Config.ENABLE_PROMETHEUS)
            Prometheus.collectDefaultMetrics();
    }
};
