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

import express from 'express';

import * as db from '../util/db';
import * as i18n from '../util/i18n';
import * as Config from '../config';
import * as exampleModel from '../model/example';

const router = express.Router();

router.use((req, res, next) => {
    if (req.query.admin_token !== Config.NL_SERVER_ADMIN_TOKEN) {
        res.status(401).json({ error: 'Not Authorized' });
        return;
    }
    if (!req.app.proxy || req.app.proxy.isProxy(req))
        next();
    else
        req.app.proxy.fanout(req, res);
});

router.post('/reload/exact/@:model_tag/:locale', (req, res, next) => {
    if (!i18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const matcher = req.app.service.getExact(req.params.locale);
    if (!matcher) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    const language = i18n.localeToLanguage(req.params.locale);
    db.withClient(async (dbClient) => {
        if (req.body.example_id) {
            const row = await exampleModel.getExactById(dbClient, req.body.example_id);
            matcher.add(row.preprocessed.split(' '), row.target_code.split(' '));
            console.log(`Added ${req.body.example_id} for language ${language}`);
        } else {
            await req.app.service.loadExactMatcher(matcher, language);
        }
    }).then(() => {
        res.json({ result: 'ok' });
    }).catch(next);
});


router.post('/reload/@:model_tag/:locale', (req, res, next) => {
    if (!i18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const model = req.app.service.getModel(req.params.model_tag, req.params.locale);
    if (!model) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    model.reload().then(() => {
        res.json({ result: 'ok' });
    }).catch(next);
});

export default router;
