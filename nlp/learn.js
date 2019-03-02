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

const router = express.Router();

const db = require('../util/db');
const iv = require('../util/input_validation');
const I18n = require('../util/i18n');
const userModel = require('../model/user');
const exampleModel = require('../model/example');

const LATEST_THINGTALK_VERSION = ThingTalk.version;

async function learn(req, res) {
    let store = req.body.store;
    if (['no', 'automatic', 'online', 'commandpedia'].indexOf(store) < 0) {
        res.status(400).json({ error: 'Invalid store parameter' });
        return;
    }
    const owner = req.body.owner;
    if (store === 'commandpedia' && !owner) {
        res.status(400).json({ error: 'Missing owner for commandpedia command' });
        return;
    }

    const service = req.app.service;
    const model = service.getModel(req.params.model_tag, req.params.locale);
    if (!model) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    if (model.accessToken !== null && model.accessToken !== req.body.access_token) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    const languageTag = I18n.localeToLanguage(req.params.locale);
    const utterance = req.body.q;
    const tokenized = await service.tokenizer.tokenize(languageTag, utterance);
    if (tokenized.tokens.length === 0) {
        res.status(400).json({ error: 'Refusing to learn an empty sentence' });
        return;
    }

    // if the client is out of date, don't even try to parse the code
    // (as it might have changed meaning in the newer version of ThingTalk
    // anyway)
    if (req.body.thingtalk_version !== LATEST_THINGTALK_VERSION) {
        res.status(200).json({ result: 'Ignored request from older ThingTalk' });
        return;
    }

    let sequence = req.body.target.split(' ');
    try {
        const parsed = ThingTalk.NNSyntax.fromNN(sequence, tokenized.entities);
        await parsed.typecheck(new ThingTalk.SchemaRetriever(model.tpClient, null, true));

        // convert back to NN to normalize the program and also check that entities and spans
        // are present
        sequence = ThingTalk.NNSyntax.toNN(parsed, tokenized.tokens, tokenized.entities);
    } catch(e) {
        res.status(400).json({ error: 'Invalid ThingTalk', detail: e.message });
        return;
    }

    const preprocessed = tokenized.tokens.join(' ');

    if (store === 'no') {
        // do nothing, successfully
        res.status(200).json({ result: 'Learnt successfully' });
        return;
    }

    const trainable = store === 'online' || store === 'commandpedia';

    if (store === 'online' && sequence[0] === 'bookkeeping')
        store = 'online-bookkeeping';

    const exampleId = await db.withTransaction(async (dbClient) => {
        let ownerId;
        if (!owner) {
            ownerId = null;
        } else if (owner.length === 8 || owner.length === 16 || owner.length === 64) {
            const result = userModel.getByCloudId(dbClient, owner);
            if (result.length === 0) {
                res.status(400).json({ error: 'Invalid command owner' });
                return null;
            }
            ownerId = result[0].id;
        } else {
            ownerId = parseInt(owner);
            if (isNaN(ownerId)) {
                res.status(400).json({ error: 'Invalid command owner' });
                return null;
            }
        }

        const ex = await exampleModel.create(dbClient, {
            is_base: false,
            language: languageTag,
            utterance: utterance,
            preprocessed: preprocessed,
            type: store,
            flags: (trainable ? 'training,exact' : ''),
            target_code: sequence,
            owner: ownerId,
            like_count: 0
        });
        if (store === 'commandpedia')
            await exampleModel.like(dbClient, ex.id, ownerId);

        if (trainable) {
            // insert a second copy of the sentence with the "replaced" flag
            await exampleModel.createReplaced(dbClient, {
                language: languageTag,
                type: store,
                flags: 'training,exact',
                preprocessed: preprocessed,
                target_code: sequence,
            });
        }
        return ex.id;
    });
    if (exampleId === null)
        return;

    if (trainable)
        model.exact.add(preprocessed, sequence);

    res.status(200).json({ result: 'Learnt successfully', example_id: exampleId });
}

router.post('/@:model_tag/:locale/learn',
    iv.validatePOST({ q: 'string', store: 'string', access_token: '?string', thingtalk_version: 'string', target: 'string', owner: '?string' }),
    (req, res, next) => { learn(req, res).catch(next); });

router.post('/:locale/learn',
    iv.validatePOST({ q: 'string', store: 'string', access_token: '?string', thingtalk_version: 'string', target: 'string', owner: '?string' }),
    (req, res, next) => { learn(req, res).catch(next); });

module.exports = router;
