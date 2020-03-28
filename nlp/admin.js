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

const db = require('../util/db');
const i18n = require('../util/i18n');
const Config = require('../config');
const modelsModel = require('../model/nlp_models');

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

    db.withClient((dbClient) => {
        if (req.body.example_id)
            return matcher.addExample(dbClient, req.body.example_id);
        return matcher.load(dbClient);
    }).then(() => {
        res.json({ result: 'ok' });
    }).catch(next);
});


router.post('/reload/@:model_tag/:locale', (req, res, next) => {
    if (!i18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const language = i18n.localeToLanguage(req.params.locale);

    db.withTransaction(async (dbClient) => {
        const spec = (await modelsModel.getByTag(dbClient, language, req.params.model_tag))[0];
        if (!spec) {
            res.status(404).json({ error: 'No such model' });
            return;
        }
        const model = req.app.service.getOrCreateModel(spec);

        await model.reload();
        res.json({ result: 'ok' });
    }, 'repeatable read', 'read only');
});

module.exports = router;
