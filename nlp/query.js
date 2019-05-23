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
const ThingTalk = require('thingtalk');

const db = require('../util/db');
const iv = require('../util/input_validation');
const I18n = require('../util/i18n');
const exampleModel = require('../model/example');
const editDistance = require('../util/edit_distance');
const classifier = require('./classifier.js');

const applyCompatibility = require('./compat');
// thingtalk version from before we started passing it to the API
const DEFAULT_THINGTALK_VERSION = '1.0.0';


var router = express.Router();

async function tokenize(req, res) {
    if (!I18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const languageTag = I18n.localeToLanguage(req.params.locale);
    const tokenized = await req.app.service.tokenizer.tokenize(languageTag, req.query.q);

    res.cacheFor(3600);
    res.json(tokenized);
}

async function runPrediction(model, tokens, entities, limit, skipTypechecking) {
    const schemas = new ThingTalk.SchemaRetriever(model.tpClient, null, true);

    let candidates = await model.predictor.predict(tokens);
    if (skipTypechecking)
        return candidates;

    candidates = await Promise.all(candidates.map(async (c) => {
        try {
            const parsed = ThingTalk.NNSyntax.fromNN(c.code, entities);
            await parsed.typecheck(schemas);
            return c;
        } catch(e) {
            return null;
        }
    }));

    candidates = candidates.filter((c) => c !== null);

    return candidates;
}

async function query(req, res) {

    const query = req.query.q;
    const store = req.query.store || 'no';
    if (store !== 'yes' && store !== 'no') {
        res.status(400).json({ error: 'Invalid store parameter' });
        return;
    }
    const thingtalk_version = req.query.thingtalk_version || DEFAULT_THINGTALK_VERSION;
    const expect = req.query.expect || null;
    const isTokenized = !!req.query.tokenized;

    if (!I18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const service = req.app.service;
    const model = service.getModel(req.params.model_tag, req.params.locale);
    if (!model) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    if (model.accessToken !== null && model.accessToken !== req.query.access_token) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    const languageTag = I18n.localeToLanguage(req.params.locale);
    let tokenized;
    if (isTokenized) {
        tokenized = {
            tokens: query.split(' '),
            entities: {},
        };
    } else {
        tokenized = await service.tokenizer.tokenize(languageTag, query);
    }

    let result = null;
    let exact = null;

    const tokens = tokenized.tokens;
    if (tokens.length === 0) {
        result = [{
            code: ['bookkeeping', 'special', 'special:failed'],
            score: 'Infinity'
        }];
    } else if (tokens.length === 1 && (/^A-Z/.test(tokens[0]) || tokens[0] === '1' || tokens[0] === '0')) {
        // if the whole input is just an entity, return that as an answer
        result = [{
            code: ['bookkeeping', 'answer', tokens[0]],
            score: 'Infinity'
        }];
    } else if (expect === 'MultipleChoice') {
        result = (req.query.choices || []).map((choice, i) => {
            return {
                code: ['bookkeeping', 'choice', String(i)],
                score: -editDistance(tokens, choice.split(' '))
            };
        });
        result.sort((a, b) => b.score - a.score);
    } else {
        exact = model.exact.get(tokens);
    }

    if (result === null) {
        result = await runPrediction(model, tokens, tokenized.entities,
            req.query.limit ? parseInt(req.query.limit) : 5,
            !!req.query.skip_typechecking);
    }

    if (store !== 'no' && expect !== 'MultipleChoice' && tokens.length > 0) {
        await db.withClient((dbClient) => {
            return exampleModel.logUtterance(dbClient, {
                language: model.locale,
                preprocessed: tokens.join(' '),
                target_code: result.length > 0 ? (result[0]['code'].join(' ')) : ''
            });
        });
    }

    if (exact !== null)
        result = exact.map((code) => ({ code, score: 'Infinity' })).concat(result);


    applyCompatibility(result, thingtalk_version);
    res.set("Cache-Control", "no-store,must-revalidate");
    classifier.classify(query).then((value) => {

      var dict = {};
      const probabilities = value.split(" ");
      dict["questions"] = parseFloat(probabilities[0]);
      dict["thingtalk"] = parseFloat(probabilities[1]);
      dict["chatty"] = parseFloat(probabilities[2]);
      dict["other"] = parseFloat(probabilities[3]);

      res.json({
           candidates: result,
           tokens: tokens,
           entities: tokenized.entities,
           intent: dict
      });

    });

}

const QUERY_PARAMS = {
    q: 'string',
    store: '?string',
    access_token: '?string',
    thingtalk_version: '?string',
    limit: '?integer',
    choices: '?array',
    tokenized: 'boolean',
    skip_typechecking: 'boolean'
};

router.get('/@:model_tag/:locale/query', iv.validateGET(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req, res).catch(next);
});

router.get('/@:model_tag/:locale/tokenize', iv.validateGET({ q: 'string' }, { json: true }), (req, res, next) => {
    tokenize(req, res).catch(next);
});

router.get('/:locale/query', iv.validateGET(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req, res).catch(next);
});

router.get('/:locale/tokenize', iv.validateGET({ q: 'string' }, { json: true }), (req, res, next) => {
    tokenize(req, res).catch(next);
});

module.exports = router;
