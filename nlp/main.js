// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
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
const AbstractFS = require('../util/abstract_fs');

const NLPModel = require('./nlp_model');
const ProxyServer = require('./proxy');

const Config = require('../config');

class NLPInferenceServer {
    constructor() {
        this._models = new Map;
        this._exactMatchers = new Map;
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

    async loadExactMatcher(matcher, language) {
        const url = AbstractFS.resolve(Config.NL_EXACT_MATCH_DIR, language + '.btrie');
        const tmpPath = await AbstractFS.download(url);

        await matcher.load(tmpPath);

        await AbstractFS.removeTemporary(tmpPath);
    }

    async loadAllLanguages() {
        for (let locale of Config.SUPPORTED_LANGUAGES) {
            const language = I18n.localeToLanguage(locale);
            const matcher = new Genie.ExactMatcher();
            await this.loadExactMatcher(matcher, language);
            this._exactMatchers.set(language, matcher);
        }

        await db.withTransaction(async (dbClient) => {
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

        // proxy enables requests fanout to all replcas in a nlp service
        if (Config.TRAINING_TASK_BACKEND === 'kubernetes')
            app.proxy = new ProxyServer(Config.NL_SERVICE_NAME);

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
            res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });

        app.use('/admin', require('./admin'));
        app.use(require('./query'));
        app.use(require('./learn'));
        app.use(require('./voice'));

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
        const parser = subparsers.add_parser('run-nlp', {
            description: 'Run the Voice & NLP inference process'
        });
        parser.add_argument('-p', '--port', {
            required: false,
            type: Number,
            help: 'Listen on the given port',
            default: 8400
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
