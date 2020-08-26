// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

const express = require('express');
const sanitizeFilename = require('sanitize-filename');
const fs = require('fs');
const util = require('util');
const tar = require('tar');
const tmp = require('tmp-promise');

const AbstractFS = require('../util/abstract_fs');
const db = require('../util/db');
const user = require('../util/user');
const nlpModelsModel = require('../model/nlp_models');
const templateModel = require('../model/template_files');
const schemaModel = require('../model/schema');
const iv = require('../util/input_validation');
const { validateTag } = require('../util/validation');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../util/errors');
const I18n = require('../util/i18n');
const { makeRandom } = require('../util/random');
const creditSystem = require('../util/credit_system');
const TrainingServer = require('../util/training_server');
const localfs = require('../util/local_fs');
const { safeMkdir } = require('../util/fsutils');

const Config = require('../config');

const router = express.Router();

router.post('/create', user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ tag: 'string', language: 'string', template: 'string', flags: '?string', config: 'string',
                      for_devices: '?string', use_approved: 'boolean', use_exact: 'boolean',
                      public: 'boolean' }), (req, res, next) => {
    try {
        JSON.parse(req.body.config);
    } catch(e) {
        iv.failKey(req, res, 'config');
        return;
    }
    if (!I18n.get(req.body.language))
        throw new BadRequestError(req._("Unsupported language"));
    const language = I18n.localeToLanguage(req.body.language);

    validateTag(req.body.tag, req.user, user.Role.NLP_ADMIN);

    db.withTransaction(async (dbClient) => {
        let trained = false, version = 0, trained_config = null, metrics = null;
        try {
            const existing = await nlpModelsModel.getByTagForUpdate(dbClient, language, req.body.tag);
            if (existing && existing.owner !== req.user.developer_org)
                throw new ForbiddenError(req._("A model with this ID already exists."));
            trained = existing.trained;
            version = existing.version;
            trained_config = existing.trained_config;
            metrics = existing.metrics;
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

        if (req.body.flags && !/^[a-zA-Z_][0-9a-zA-Z_]*(?:[ ,]+[a-zA-Z_][0-9a-zA-Z_]*)*$/.test(req.body.flags))
            throw new BadRequestError(req._("Invalid flags"));

        const flags = req.body.flags ? req.body.flags.split(/[ ,]+/g) : [];

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

        // normalize config JSON, strip spaces
        const config = JSON.stringify(JSON.parse(req.body.config));

        await nlpModelsModel.create(dbClient, {
            language,
            tag: req.body.tag,
            owner: req.user.developer_org,
            access_token: req.body.public ? null : makeRandom(32),
            template_file: template.id,
            flags: JSON.stringify(flags),
            config: config,
            all_devices: devices.length === 0,
            use_approved: !!req.body.use_approved,
            use_exact: !!req.body.use_exact,
            metrics: metrics,
            trained: trained,
            trained_config: trained_config,
            version: version
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

router.get('/download/:language/:tag', user.requireLogIn, (req, res, next) => {
    db.withClient(async (dbClient) => {
        const models = await nlpModelsModel.getByTag(dbClient, req.params.language, req.params.tag);
        if (models.length === 0)
            throw new NotFoundError();
        const [model] = models;

        // check for permission: we allow download of the user's own models always,
        // and of public models (access token === null), if they only use approved devices
        if (!model.trained ||
            !(model.owner === req.user.developer_org ||
              (model.access_token === null && model.use_approved))) {
            // note that this must be exactly the same error used by util/db.js
            // so that a true not found is indistinguishable from not having permission
            throw new NotFoundError();
        }

        return model.version;
    }).then(async (version) => {
        const cachedir = localfs.getCacheDir();

        let modelLangDir = req.params.tag + ':' + req.params.language;
        const tarballname = modelLangDir + '.tar.gz';

        // append version number to model if not 0 (this is for compat with pre-versioning
        // naming convention)
        if (version !== 0)
            modelLangDir += '-v' + version;
        res.set('Content-Type', 'application/x-tar');
        res.set('Content-Disposition', `attachment; filename="${tarballname}"`); //"

        // this ETag is weak, because strictly speaking different processes with different
        // cache dirs might generate slightly different tarball (e.g. different file order or
        // mtime) but the tarballs would be functionally identical
        const etag = `W/"version:${version}"`;
        res.set(`ETag`, etag);
        if (req.headers['if-none-match'] === etag) {
            res.status(304); // not modified
            res.send('');
            return;
        }
        // cache this for one day
        res.cacheFor(86400000);

        const tarballpath = cachedir + '/models/' + sanitizeFilename(tarballname);

        // check if we have cached the tarball already
        if (await util.promisify(fs.exists)(tarballpath)) {
            fs.createReadStream(tarballpath).pipe(res);
            return;
        }

        await safeMkdir(cachedir + '/models');

        // if not, download the model and make the tarball

        // make the tarball in a temporary path in the cache directory
        const { path: tmppath, cleanup } = await tmp.file({ discardDescriptor: true, dir: cachedir + '/models' });

        let success = false;
        try {
            const tmpdir = await AbstractFS.download(AbstractFS.resolve(Config.NL_MODEL_DIR, './' + modelLangDir) + '/');
            await tar.create({
                file: tmppath,
                gzip: true,
                cwd: tmpdir,
                portable: true,
            }, await util.promisify(fs.readdir)(tmpdir));

            // atomically rename the created tarball to the correct cache directory path
            await util.promisify(fs.rename)(tmppath, tarballpath);

            success = true;

            await AbstractFS.removeTemporary(tmpdir);

            // now that we have the tarball in the cache directory, we can stream it to the user
            fs.createReadStream(tarballpath).pipe(res);
        } finally {
            if (!success)
                await cleanup();
        }
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

        if ((req.user.roles & user.Role.ADMIN) !== user.Role.ADMIN)
            await creditSystem.payCredits(dbClient, req, req.user.developer_org, creditSystem.TRAIN_THINGPEDIA_COST);
        await TrainingServer.get().queueModel(req.body.language, req.body.tag, 'train', req.user.developer_org);
    }).then(() => {
        res.redirect(303, '/developers/models');
    }).catch(next);
});

module.exports = router;
