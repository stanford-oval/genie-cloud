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

const cmd = require('../util/command');
const db = require('../util/db');
const i18n = require('../util/i18n');
const path = require('path');
const Config = require('../config');

const router = express.Router();

router.use((req, res, next) => {
    if (req.query.admin_token !== Config.NL_SERVER_ADMIN_TOKEN) {
        res.status(401).json({ error: 'Not Authorized' });
        return;
    }
    next();
});

router.post('/reload/exact/@:model_tag/:locale', (req, res, next) => {
    if (!i18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const model = req.app.service.getModel(req.params.model_tag, req.params.locale);
    if (!model) {
        res.status(404).json({ error: 'No such model' });
        return;
    }

    db.withClient((dbClient) => {
        return model.exact.load(dbClient);
    }).then(() => {
        res.json({ result: 'ok' });
    }).catch(next);
});


router.post('/reload/@:model_tag/:locale', async (req, res, next) => {
    if (!i18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    if (Config.NL_MODEL_DIR) {
        const modelLangDir = `${req.params.model_tag}:${req.params.locale}`;
        await cmd.exec('aws', ['s3',
            'sync',
            `${Config.NL_MODEL_DIR}/${modelLangDir}/`,
            path.resolve('.') + '/' + modelLangDir + '/'
        ]);
	
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

module.exports = router;
