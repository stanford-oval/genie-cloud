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

import express from 'express';

import * as iv from '../util/input_validation';
import * as I18n from '../util/i18n';

import runNLU from './nlu';

let router = express.Router();

async function tokenize(params, data, res) {
    const langPack = I18n.get(params.locale, false);
    if (!langPack) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const tokenizer = langPack.genie.getTokenizer();
    const tokenized = await tokenizer.tokenize(data.q);

    // adjust the API to be what it used to be before we got rid of almond-tokenizer
    tokenized.raw_tokens = tokenized.rawTokens;
    delete tokenized.rawTokens;

    tokenized.result = 'ok';
    res.cacheFor(3600);
    res.json(tokenized);
}

async function query(params, data, res) {
    const query = data.q;
    if (!I18n.get(params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const result = await runNLU(query, params, data, res.app.service, res);
    if (result === undefined)
        return;

    res.json(result);
}

const QUERY_PARAMS = {
    q: 'string',
    store: '?string',
    access_token: '?string',
    thingtalk_version: '?string',
    limit: '?integer',
    expect: '?string',
    choices: '?array',
    context: '?string',
    entities: '?object',
    tokenized: 'boolean',
    skip_typechecking: 'boolean',
    developer_key: '?string',
};

router.get('/@:model_tag/:locale/query', iv.validateGET(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req.params, req.query, res).catch(next);
});

router.get('/@:model_tag/:locale/tokenize', iv.validateGET({ q: 'string' }, { json: true }), (req, res, next) => {
    tokenize(req.params, req.query, res).catch(next);
});

router.get('/:locale/query', iv.validateGET(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req.params, req.query, res).catch(next);
});

router.get('/:locale/tokenize', iv.validateGET({ q: 'string' }, { json: true }), (req, res, next) => {
    tokenize(req.params, req.query, res).catch(next);
});

router.post('/@:model_tag/:locale/query', iv.validatePOST(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req.params, req.body, res).catch(next);
});

router.post('/@:model_tag/:locale/tokenize', iv.validatePOST({ q: 'string' }, { json: true }), (req, res, next) => {
    tokenize(req.params, req.body, res).catch(next);
});

router.post('/:locale/query', iv.validatePOST(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req.params, req.body, res).catch(next);
});

router.post('/:locale/tokenize', iv.validatePOST({ q: 'string' }, { json: true }), (req, res, next) => {
    tokenize(req.params, req.body, res).catch(next);
});

export default router;
