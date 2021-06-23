// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as argparse from 'argparse';
import express from 'express';
import expressWS from 'express-ws';
import logger from 'morgan';
import bodyParser from 'body-parser';
import cacheable from 'cacheable-middleware';
import Prometheus from 'prom-client';
import * as Genie from 'genie-toolkit';
import rateLimit from 'express-rate-limit';

import * as db from '../util/db';
import Metrics from '../util/metrics';
import * as errorHandling from '../util/error_handling';
import * as modelsModel from '../model/nlp_models';
import * as I18n from '../util/i18n';
import * as AbstractFS from '../util/abstract_fs';

import NLPModel from './nlp_model';
import ProxyServer from './proxy';

import * as Config from '../config';

declare global {
    namespace Express {
        interface Application {
            service : NLPInferenceServer;
            proxy ?: ProxyServer;
        }
    }
}

export class NLPInferenceServer {
    private _models : Map<string, NLPModel>;
    private _exactMatchers : Map<string, Genie.ExactMatcher>;

    constructor() {
        this._models = new Map;
        this._exactMatchers = new Map;
    }

    getExact(locale : string) {
        const splitTag = locale.split(/[_.-]/g);

        while (splitTag.length > 0) {
            const matcher = this._exactMatchers.get(splitTag.join('-'));
            if (matcher)
                return matcher;
            splitTag.pop();
        }
        return undefined;
    }

    getModel(modelTag = 'org.thingpedia.models.default', locale : string) {
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

    getOrCreateModel(spec : modelsModel.Row) {
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

    async loadExactMatcher(matcher : Genie.ExactMatcher, language : string) {
        const url = AbstractFS.resolve(Config.NL_EXACT_MATCH_DIR, language + '.btrie');
        const tmpPath = await AbstractFS.download(url);

        await matcher.load(tmpPath);

        await AbstractFS.removeTemporary(tmpPath);
    }

    async loadAllLanguages() {
        for (const locale of Config.SUPPORTED_LANGUAGES) {
            const language = I18n.localeToLanguage(locale);
            const matcher = new Genie.ExactMatcher();
            await this.loadExactMatcher(matcher, language);
            this._exactMatchers.set(language, matcher);
        }

        await db.withTransaction(async (dbClient) => {
            const modelspecs = await modelsModel.getAll(dbClient);
            for (const modelspec of modelspecs) {
                const model = new NLPModel(modelspec, this);
                await model.load();
                this._models.set(model.id, model);
            }
        }, 'repeatable read', 'read only');

        console.log(`Loaded ${this._models.size} models`);
    }

    async initFrontend(port : number) {
        const app = express();
        expressWS(app);

        // proxy enables requests fanout to all replcas in a nlp service
        if (Config.TRAINING_TASK_BACKEND === 'kubernetes')
            app.proxy = new ProxyServer(Config.NL_SERVICE_NAME);

        app.service = this;
        app.set('port', port);
        app.enable('trust proxy');
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(cacheable());
        app.use(rateLimit({ max: 100 }));

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

        app.use('/admin', (await import('./admin')).default);
        app.use((await import('./query')).default);
        app.use((await import('./learn')).default);
        app.use((await import('./voice')).default);

        // if we get here, we have a 404 error
        app.use('/', (req, res) => {
            res.status(404).json({ error: 'Invalid endpoint' });
        });
        app.use(errorHandling.json);

        app.listen(app.get('port'));
    }
}

export function initArgparse(subparsers : argparse.SubParser) {
    const parser = subparsers.add_parser('run-nlp', {
        description: 'Run the Voice & NLP inference process'
    });
    parser.add_argument('-p', '--port', {
        required: false,
        type: Number,
        help: 'Listen on the given port',
        default: 8400
    });
}

export async function main(argv : any) {
    const daemon = new NLPInferenceServer();

    daemon.loadAllLanguages();
    await daemon.initFrontend(argv.port);

    if (Config.ENABLE_PROMETHEUS)
        Prometheus.collectDefaultMetrics();
}
