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

const iv = require('../util/input_validation');
const I18n = require('../util/i18n');

const runNLU = require('./nlu');

var router = express.Router();

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

module.exports = router;
