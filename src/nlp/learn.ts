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
import * as ThingTalk from 'thingtalk';
import * as Tp from 'thingpedia';
import * as Genie from 'genie-toolkit';

import * as db from '../util/db';
import * as iv from '../util/input_validation';
import * as I18n from '../util/i18n';
import * as userModel from '../model/user';
import * as exampleModel from '../model/example';
import * as Config from '../config';

const router = express.Router();

const LATEST_THINGTALK_VERSION = ThingTalk.version;

async function learn(req : express.Request, res : express.Response) {
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

    const langPack = I18n.get(req.params.locale, false);
    if (!langPack) {
        res.status(404).json({ error: 'Unsupported language' });
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
    const tokenizer = langPack.genie.getTokenizer();
    const tokenized = await tokenizer.tokenize(utterance);
    if (tokenized.tokens.length === 0) {
        res.status(400).json({ error: 'Refusing to learn an empty sentence' });
        return;
    }

    // if the client is out of date, don't even try to parse the code
    // (as it might have changed meaning in the newer version of ThingTalk
    // anyway)
    if (req.body.thingtalk_version !== LATEST_THINGTALK_VERSION) {
        res.status(200).json({ result: "ok", message: 'Ignored request from older ThingTalk' });
        return;
    }

    let sequence = req.body.target.split(' ');
    try {
        const parsed = ThingTalk.Syntax.parse(sequence, ThingTalk.Syntax.SyntaxType.Tokenized, tokenized.entities);
        await parsed.typecheck(new ThingTalk.SchemaRetriever(model.tpClient, null, true));

        // serialize again to normalize the program and also check that entities and spans are present
        sequence = Genie.ThingTalkUtils.serializePrediction(parsed, tokenized.tokens, tokenized.entities, {
            locale: req.params.locale
        });
    } catch(e) {
        res.status(400).json({ error: 'Invalid ThingTalk', detail: e.message });
        return;
    }
    const target_code = sequence.join(' ');
    const preprocessed = tokenized.tokens.join(' ');

    if (store === 'no') {
        // do nothing, successfully
        res.status(200).json({ result: "ok", message: 'Learnt successfully' });
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
            try {
                const result = await userModel.getIdByCloudId(dbClient, owner);
                ownerId = result.id;
            } catch(e) {
                if (e.code === 'ENOENT') {
                    res.status(400).json({ error: 'Invalid command owner' });
                    return null;
                } else {
                    throw e;
                }
            }
        } else {
            ownerId = parseInt(owner);
            if (isNaN(ownerId)) {
                res.status(400).json({ error: 'Invalid command owner' });
                return null;
            }
        }

        const exid = await exampleModel.create(dbClient, {
            is_base: false,
            language: languageTag,
            utterance: utterance,
            preprocessed: preprocessed,
            type: store,
            flags: (trainable ? 'training,exact' : ''),
            target_code: target_code,
            target_json: '',
            owner: ownerId,
            like_count: 0
        });
        if (store === 'commandpedia')
            await exampleModel.like(dbClient, exid, ownerId);
        return exid;
    });
    if (!exampleId)
        return;

    if (trainable) {
        model.exact.add(preprocessed.split(' '), target_code.split(' '));
        if (req.app.proxy) {
            // call other replicas to reload the new example
            const path = `/admin/reload/exact/@${req.params.model_tag}/${req.params.locale}?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`;
            const promises = [];
            for (const replica of await req.app.proxy.getEndpoints(Config.NL_SERVICE_NAME, true)) {
                promises.push(Tp.Helpers.Http.post( `http://${replica}${path}`, `example_id=${encodeURIComponent(exampleId)}`, {
                    dataContentType: 'application/x-www-form-urlencoded',
                    extraHeaders: req.app.proxy.header()
                }));
            }
            await Promise.all(promises);
        }
    }
    res.status(200).json({ result: 'ok', message: 'Learnt successfully', example_id: exampleId });
}

router.post('/@:model_tag/:locale/learn',
    iv.validatePOST({ q: 'string', store: 'string', access_token: '?string', thingtalk_version: 'string', target: 'string', owner: '?string' }, { json: true }),
    (req, res, next) => { learn(req, res).catch(next); });

router.post('/:locale/learn',
    iv.validatePOST({ q: 'string', store: 'string', access_token: '?string', thingtalk_version: 'string', target: 'string', owner: '?string' }, { json: true }),
    (req, res, next) => { learn(req, res).catch(next); });

export default router;
