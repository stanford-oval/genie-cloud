// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

import express from 'express';

import * as db from '../util/db';
import * as commandModel from '../model/example';
import * as iv from '../util/input_validation';
import * as userUtils from '../util/user';
import { validatePageAndSize } from '../util/pagination';
import * as I18n from '../util/i18n';
import { getCommandDetails } from '../util/commandpedia';

let router = express.Router();

router.post('/suggest', iv.validatePOST({ description: 'string' }), (req, res, next) => {
    let command = req.body['description'];
    db.withTransaction((dbClient) => {
        return commandModel.suggest(dbClient, command);
    }).then(() => {
        return res.redirect(303, '/');
    }).catch(next);
});

router.get('/all', iv.validateGET({ page: '?number', locale: '?string' }, { json: true }), (req, res, next) => {
    const [page, page_size] = validatePageAndSize(req, 9, 50);
    const language = I18n.localeToLanguage(req.locale);

    db.withTransaction(async (client) => {
        let commands;
        if (userUtils.isAuthenticated(req))
            commands = await commandModel.getCommandsForUser(client, language, req.user.id, page * page_size, page_size);
        else
            commands = await commandModel.getCommands(client, language, page * page_size, page_size);

        getCommandDetails(req.gettext, commands);
        res.cacheFor(30 * 1000);
        res.json({ result: 'ok', data: commands });
    }).catch(next);
});

router.get('/search', iv.validateGET({ q: 'string', page: '?number', locale: '?string' }, { json: true }), (req, res, next) => {
    const q = req.query.q;
    const language = I18n.localeToLanguage(req.locale);

    db.withTransaction(async (client) => {
        let commands;
        if (userUtils.isAuthenticated(req))
            commands = await commandModel.getCommandsByFuzzySearchForUser(client, language, req.user.id, q);
        else
            commands = await commandModel.getCommandsByFuzzySearch(client, language, q);

        getCommandDetails(req.gettext, commands);
        res.cacheFor(30 * 1000);
        res.json({ result: 'ok', data: commands });
    }).catch(next);
});

export default router;
