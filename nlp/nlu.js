// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const db = require('../util/db');
const I18n = require('../util/i18n');
const exampleModel = require('../model/example');
const editDistance = require('../util/edit_distance');

const applyCompatibility = require('./compat');
// thingtalk version from before we started passing it to the API
const DEFAULT_THINGTALK_VERSION = '1.0.0';

function isValidDeveloperKey(developerKey) {
    return developerKey && developerKey !== 'null' && developerKey !== 'undefined';
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

async function runNLU(query, params, data, service, res) {
    const store = data.store || 'no';
    if (store !== 'yes' && store !== 'no') {
        res.status(400).json({ error: 'Invalid store parameter' });
        return undefined;
    }
    const thingtalk_version = data.thingtalk_version || DEFAULT_THINGTALK_VERSION;
    const expect = data.expect || null;
    const isTokenized = !!data.tokenized;

    let modelTag = params.model_tag;
    if (!modelTag) {
        if (isValidDeveloperKey(data.developer_key)) {
            if (data.context)
                modelTag = 'org.thingpedia.models.developer.contextual';
            else
                modelTag = 'org.thingpedia.models.developer';
        } else {
            if (data.context)
                modelTag = 'org.thingpedia.models.contextual';
            else
                modelTag = 'org.thingpedia.models.default';
        }
    }

    const model = service.getModel(modelTag, params.locale);
    if (!model || !model.trained) {
        res.status(404).json({ error: 'No such model' });
        return undefined;
    }

    if (model.accessToken !== null && model.accessToken !== data.access_token) {
        res.status(404).json({ error: 'No such model' });
        return undefined;
    }

    const languageTag = I18n.localeToLanguage(params.locale);

    // this exists for API compatibility only (until we restore the frontend classifier)
    // for now, all commands are well, commands
    const intent = {
        question: 0,
        command: 1,
        chatty: 0,
        other: 0
    };

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
        const choices = await Promise.all((data.choices || []).map((choice) => service.tokenizer.tokenize(languageTag, choice, expect)));
        result = choices.map((choice, i) => {
            return {
                code: ['bookkeeping', 'choice', String(i)],
                score: -editDistance(tokens, choice.tokens)
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
    return {
         candidates: result,
         tokens: tokens,
         entities: tokenized.entities,
         intent
    };
}

module.exports = runNLU;
