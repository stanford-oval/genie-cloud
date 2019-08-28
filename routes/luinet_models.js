// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');

const db = require('../util/db');
const user = require('../util/user');
const nlpModelsModel = require('../model/nlp_models');
const templateModel = require('../model/template_files');
const schemaModel = require('../model/schema');
const iv = require('../util/input_validation');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../util/errors');
const I18n = require('../util/i18n');
const { makeRandom } = require('../util/random');
const creditSystem = require('../util/credit_system');
const TrainingServer = require('../util/training_server');

const router = express.Router();

router.post('/create', user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ tag: 'string', language: 'string', template: 'string', flags: '?string',
                      for_devices: '?string', use_approved: 'boolean', use_exact: 'boolean',
                      public: 'boolean' }), (req, res, next) => {
    if (!I18n.get(req.body.language))
        throw new BadRequestError(req._("Unsupported language"));
    const language = I18n.localeToLanguage(req.body.language);

    db.withTransaction(async (dbClient) => {
        try {
            const existing = await nlpModelsModel.getByTagForUpdate(dbClient, language, req.body.tag);
            if (existing && existing.owner !== req.user.developer_org)
                throw new ForbiddenError(req._("A model with this ID already exists."));
        } catch(e) {
            if (e.code !== 'ENOENT')
                throw e;

            // only pay if the model does not exist already
            await creditSystem.payCredits(dbClient, req, req.user.developer_org, creditSystem.CREATE_MODEL_COST);
        }

        let template;
        try {
            template = await templateModel.getByTag(dbClient, language, req.body.template);
        } catch(e) {
            if (e.code !== 'ENOENT')
                throw e;
            throw new BadRequestError(req._("No such template pack %s").format(req.body.template));
        }

        if (req.body.flags && !/^[a-zA-Z_][0-9a-zA-Z_]*(?:[ ,][a-zA-Z_][0-9a-zA-Z_]*)*$/.test(req.body.flags))
            throw new BadRequestError(req._("Invalid flags"));

        const flags = req.body.flags ? req.body.flags.split(/[ ,]/g) : [];

        // remove the turking flag if specified (it has a special meaning related to mturk)
        const turkingIdx = flags.indexOf('turking');
        if (turkingIdx >= 0)
            flags.splice(turkingIdx, 1);

        const allowedFlags = new Set(JSON.parse(template.flags));
        for (let f of flags) {
            if (!allowedFlags.has(f))
                throw new BadRequestError(req._("The template %s does not support the flag %s").format(req.body.template, f));
        }

        if (req.body.for_devices && !/^[a-zA-Z_][0-9a-zA-Z_.-]*(?:[ ,][a-zA-Z_][0-9a-zA-Z_.-]*)*$/.test(req.body.for_devices))
            throw new BadRequestError(req._("Invalid device list"));

        const devices = req.body.for_devices ? req.body.for_devices.split(/[ ,]/g) : [];
        const missing = await schemaModel.findNonExisting(dbClient, devices, req.user.developer_org);
        if (missing.length > 0)
            throw new BadRequestError(req._("The following devices do not exist or are not visible: %s").format(missing.join(req._(", "))));

        await nlpModelsModel.create(dbClient, {
            language,
            tag: req.body.tag,
            owner: req.user.developer_org,
            access_token: req.body.public ? null : makeRandom(32),
            template_file: template.id,
            flags: JSON.stringify(flags),
            all_devices: devices.length === 0,
            use_approved: !!req.body.use_approved,
            use_exact: !!req.body.use_exact,
        }, devices);

        res.redirect(303, '/developers/models');
    }).catch(next);
});

router.get('/', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const models = await nlpModelsModel.getPublic(dbClient, user.isAuthenticated(req) ? req.user.developer_org : null);
        res.render('luinet_model_list', {
            page_title: req._("LUInet - Available Models"),
            models
        });
    }).catch(next);
});

router.post('/train', user.requireLogIn, user.requireDeveloper(), iv.validatePOST({ language: 'string', tag: 'string' }), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const [model] = await nlpModelsModel.getByTag(dbClient, req.body.language, req.body.tag);
        if (!model || model.owner !== req.user.developer_org) {
            // note that this must be exactly the same error used by util/db.js
            // so that a true not found is indistinguishable from not having permission
            throw new NotFoundError();
        }

        await creditSystem.payCredits(dbClient, req, req.user.developer_org, creditSystem.TRAIN_THINGPEDIA_COST);
        await TrainingServer.get().queueModel(req.body.language, req.body.tag, 'train-only');
    }).then(() => {
        res.redirect(303, '/developer/models' + req.body.kind);
    }).catch(next);
});

module.exports = router;
