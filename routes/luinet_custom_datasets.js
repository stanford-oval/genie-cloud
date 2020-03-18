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

const express = require('express');

const AbstractFS = require('../util/abstract_fs');
const db = require('../util/db');
const user = require('../util/user');
const templateModel = require('../model/template_files');
const schemaModel = require('../model/schema');
const iv = require('../util/input_validation');
const trainingJobModel = require('../model/training_job');
const { NotFoundError, BadRequestError } = require('../util/errors');
const I18n = require('../util/i18n');
const creditSystem = require('../util/credit_system');
const TrainingServer = require('../util/training_server');

const Config = require('../config');

const VALID_JOBS = ['gen-custom-synthetic', 'gen-custom-augmented', 'gen-custom-turking'];

const router = express.Router();

router.use(user.requireLogIn, user.requireDeveloper());

router.post('/create',
    iv.validatePOST({ job_type: 'string', language: 'string', template: 'string', flags: '?string', config: 'string',
                      for_devices: '?string', }), (req, res, next) => {
    try {
        JSON.parse(req.body.config);
    } catch(e) {
        iv.failKey(req, res, 'config');
        return;
    }
    if (VALID_JOBS.indexOf(req.body.job_type) < 0) {
        iv.failKey(req, res, 'job_type');
        return;
    }

    if (!I18n.get(req.body.language))
        throw new BadRequestError(req._("Unsupported language"));
    const language = I18n.localeToLanguage(req.body.language);

    db.withTransaction(async (dbClient) => {
        await creditSystem.payCredits(dbClient, req, req.user.developer_org, creditSystem.GENERATE_CUSTOM_DATASET_COST);

        let template;
        try {
            template = await templateModel.getByTag(dbClient, language, req.body.template);
        } catch(e) {
            if (e.code !== 'ENOENT')
                throw e;
            throw new BadRequestError(req._("No such template pack %s").format(req.body.template));
        }

        if (req.body.flags && !/^[a-zA-Z_][0-9a-zA-Z_]*(?:[ ,]+[a-zA-Z_][0-9a-zA-Z_]*)*$/.test(req.body.flags))
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

        const devices = req.body.for_devices ? req.body.for_devices.split(/[ ,]/g) : null;
        const missing = await schemaModel.findNonExisting(dbClient, devices || [], req.user.developer_org);
        if (missing.length > 0)
            throw new BadRequestError(req._("The following devices do not exist or are not visible: %s").format(missing.join(req._(", "))));

        const config = JSON.parse(req.body.config);
        config.owner = req.user.developer_org;
        config.template_file_name = template.tag;
        config.synthetic_flags = flags;
        return [devices, config];
    }).then(async ([devices, config]) => {
        // THIS IS NOT GREAT: there could be a race condition invalidating all the security checks above...
        await TrainingServer.get().queue(language, devices, req.body.job_type, req.user.developer_org, config);

        res.redirect(303, '/developers/models');
    }).catch(next);
});

router.get('/download/:job_id', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const job = await trainingJobModel.get(dbClient, req.params.job_id);
        if (job.owner !== req.user.developer_org || VALID_JOBS.indexOf(job.job_type) < 0)
            throw new NotFoundError();
        if (job.status !== 'success')
            throw new BadRequestError(req._("The dataset is not yet ready for download."));
    }).then(async () => {
        const jobDir = AbstractFS.resolve(Config.TRAINING_DIR, './jobs/' + req.params.job_id);
        const outputPath = AbstractFS.resolve(jobDir, 'output.tsv');

        const streamOrLink = await AbstractFS.getDownloadLinkOrStream(outputPath);
        if (typeof streamOrLink === 'string') {
            res.redirect(302, streamOrLink);
        } else {
            res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
            streamOrLink.pipe(res);
        }
    }).catch(next);
});

module.exports = router;
