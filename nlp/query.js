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
const Genie = require('genie-toolkit');

const db = require('../util/db');
const iv = require('../util/input_validation');
const I18n = require('../util/i18n');
const exampleModel = require('../model/example');
const editDistance = require('../util/edit_distance');

const applyCompatibility = require('./compat');
// thingtalk version from before we started passing it to the API
const DEFAULT_THINGTALK_VERSION = '1.0.0';


var router = express.Router();

async function tokenize(params, data, service, res) {
    if (!I18n.get(params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const languageTag = I18n.localeToLanguage(params.locale);
    const tokenized = await service.tokenizer.tokenize(languageTag, data.q, data.expect || null);
    if (data.entities)
        Genie.Utils.renumberEntities(tokenized, data.entities);

    res.cacheFor(3600);
    res.json(tokenized);
}

async function runPrediction(model, tokens, entities, context, limit, skipTypechecking) {
    const schemas = new ThingTalk.SchemaRetriever(model.tpClient, null, true);

    let candidates = await model.predictor.predict(tokens, context);
    if (skipTypechecking)
        return candidates.slice(0, limit);

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

    if (limit >= 0)
        return candidates.slice(0, limit);
    else
        return candidates;
}

async function query(params, data, service, res) {
    const query = data.q;
    const store = data.store || 'no';
    if (store !== 'yes' && store !== 'no') {
        res.status(400).json({ error: 'Invalid store parameter' });
        return;
    }
    const thingtalk_version = data.thingtalk_version || DEFAULT_THINGTALK_VERSION;
    const expect = data.expect || null;
    const isTokenized = !!data.tokenized;

    if (!I18n.get(params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    let modelTag = params.model_tag;
    if (!modelTag) {
        if (data.context)
            modelTag = 'org.thingpedia.models.contextual';
        else
            modelTag = 'org.thingpedia.models.default';
    }

    const model = service.getModel(modelTag, params.locale);
    if (!model || !model.trained) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    if (model.accessToken !== null && model.accessToken !== data.access_token) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    const languageTag = I18n.localeToLanguage(params.locale);

    const intent = await service.frontendClassifier.classify(query);
    delete intent.id;

    let tokenized;
    if (isTokenized) {
        tokenized = {
            tokens: query.split(' '),
            entities: {},
        };
        if (data.entities) {
            // safety against weird properties
            for (let key of Object.getOwnPropertyNames(data.entities)) {
                if (/^(.+)_([0-9]+)$/.test(key))
                    tokenized[key] = data.entities[key];
            }
        }
    } else {
        tokenized = await service.tokenizer.tokenize(languageTag, query, expect);
        if (data.entities)
            Genie.Utils.renumberEntities(tokenized, data.entities);
    }

    let result = null;
    let exact = null;

    const tokens = tokenized.tokens;
    if (tokens.length === 0) {
        result = [{
            code: ['bookkeeping', 'special', 'special:failed'],
            score: 'Infinity'
        }];
    } else if (tokens.length === 1 && (/^[A-Z]/.test(tokens[0]) || tokens[0] === '1' || tokens[0] === '0')) {
        // if the whole input is just an entity, return that as an answer
        result = [{
            code: ['bookkeeping', 'answer', tokens[0]],
            score: 'Infinity'
        }];
    } else if (expect === 'MultipleChoice') {
        result = (data.choices || []).map((choice, i) => {
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
        if (expect === 'Location') {
            result = [{
                code: ['bookkeeping', 'answer', 'location:', '"', ...tokens, '"'],
                score: 1
            }];
        } else {
            result = await runPrediction(model, tokens, tokenized.entities,
                                         data.context ? data.context.split(' ') : undefined,
                                         data.limit ? parseInt(data.limit) : 5,
                                         !!data.skip_typechecking);
        }
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

    await applyCompatibility(params.locale, result, tokenized.entities, thingtalk_version);

    res.set("Cache-Control", "no-store,must-revalidate");
    res.json({
         candidates: result,
         tokens: tokens,
         entities: tokenized.entities,
         intent
    });

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
    skip_typechecking: 'boolean'
};

router.get('/@:model_tag/:locale/query', iv.validateGET(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req.params, req.query, req.app.service, res).catch(next);
});

router.get('/@:model_tag/:locale/tokenize', iv.validateGET({ q: 'string', entities: '?object' }, { json: true }), (req, res, next) => {
    tokenize(req.params, req.query, req.app.service, res).catch(next);
});

router.get('/:locale/query', iv.validateGET(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req.params, req.query, req.app.service, res).catch(next);
});

router.get('/:locale/tokenize', iv.validateGET({ q: 'string', expect: '?string', entities: '?object' }, { json: true }), (req, res, next) => {
    tokenize(req.params, req.query, req.app.service, res).catch(next);
});

router.post('/@:model_tag/:locale/query', iv.validatePOST(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req.params, req.body, req.app.service, res).catch(next);
});

router.post('/@:model_tag/:locale/tokenize', iv.validatePOST({ q: 'string', expect: '?string', entities: '?object' }, { json: true }), (req, res, next) => {
    tokenize(req.params, req.body, req.app.service, res).catch(next);
});

router.post('/:locale/query', iv.validatePOST(QUERY_PARAMS, { json: true }), (req, res, next) => {
    query(req.params, req.body, req.app.service, res).catch(next);
});

router.post('/:locale/tokenize', iv.validatePOST({ q: 'string', entities: '?object' }, { json: true }), (req, res, next) => {
    tokenize(req.params, req.body, req.app.service, res).catch(next);
});

module.exports = router;
