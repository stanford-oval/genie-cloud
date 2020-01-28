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
const multer = require('multer');
const csurf = require('csurf');
const JSZip = require('jszip');
const fs = require('fs');
const util = require('util');
const os = require('os');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/template_files');
const iv = require('../util/input_validation');
const { validateTag } = require('../util/validation');
const { ForbiddenError, BadRequestError } = require('../util/errors');
const I18n = require('../util/i18n');
const code_storage = require('../util/code_storage');

const router = express.Router();

async function uploadZipFile(req, obj, stream) {
    const zipFile = new JSZip();

    // unfortunately JSZip only loads from memory, so we need to load the entire file
    // at once
    // this is somewhat a problem, because the file can be up to 30-50MB in size
    // we just hope the GC will get rid of the buffer quickly

    const buffer = await new Promise((callback, errback) => {
        let buffers = [];
        let length = 0;
        stream.on('data', (buffer) => {
            buffers.push(buffer);
            length += buffer.length;
        });
        stream.on('end', () => {
            callback(Buffer.concat(buffers, length));
        });
        stream.on('error', errback);
    });
    try {
        await zipFile.loadAsync(buffer, { checkCRC32: false });
    } catch(e) {
        throw new BadRequestError(e.message);
    }
    const indexGenie = zipFile.file('index.genie');
    if (!indexGenie)
        throw new BadRequestError(req._("index.genie missing from template zip file"));

    await code_storage.storeZipFile(buffer, obj.tag, obj.version, 'template-files/' + obj.language);
}

async function uploadTemplatePack(req) {
    try {
        if (!I18n.get(req.body.language))
            throw new BadRequestError(req._("Unsupported language"));

        if (req.body.flags && !/^[a-zA-Z_][0-9a-zA-Z_]*(?:[ ,]+[a-zA-Z_][0-9a-zA-Z_]*)*$/.test(req.body.flags))
            throw new BadRequestError(req._("Invalid flags"));

        validateTag(req.body.tag, req.user, user.Role.NLP_ADMIN);

        const flags = req.body.flags ? req.body.flags.split(/[ ,]/g) : [];
        if (flags.indexOf('turking') < 0)
            flags.unshift('turking');

        const zipFile = req.files && req.files.upload && req.files.upload.length ?
                        req.files.upload[0] : null;
        if (!zipFile)
            throw new BadRequestError(req._("Zip file missing"));

        await db.withTransaction(async (dbClient) => {
            const language = I18n.localeToLanguage(req.body.language);

            let template;
            try {
                template = await model.getByTagForUpdate(dbClient, language, req.body.tag);
                if (template && template.owner !== req.user.developer_org)
                    throw new ForbiddenError(req._("A template pack with this ID already exists."));

                await model.update(dbClient, template.id, {
                    tag: req.body.tag,
                    owner: req.user.developer_org,
                    language: language,
                    flags: JSON.stringify(flags),
                    description: req.body.description,
                    version: template.version + 1,
                    public: !!req.body.public,
                });
                template.version = template.version + 1;
            } catch(e) {
                if (e.code !== 'ENOENT')
                    throw e;

                template = await model.create(dbClient, {
                    tag: req.body.tag,
                    owner: req.user.developer_org,
                    language: language,
                    flags: JSON.stringify(flags),
                    description: req.body.description,
                    version: 0,
                    public: !!req.body.public,
                });
            }

            await uploadZipFile(req, template, fs.createReadStream(zipFile.path));
        });
    } finally {
        if (req.files.upload && req.files.upload.length)
            await util.promisify(fs.unlink)(req.files.upload[0].path);
    }
}

router.post('/create', multer({ dest: os.tmpdir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }), user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ tag: 'string', description: 'string', language: 'string', flags: '?string', public: 'boolean' }), (req, res, next) => {
    uploadTemplatePack(req).then(() => {
        res.redirect(303, '/developers/models');
    }).catch(next);
});

router.use(csurf({ cookie: false }));

router.get('/', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const templates = await model.getPublic(dbClient, user.isAuthenticated(req) ? req.user.developer_org : null);
        res.render('luinet_template_list', {
            page_title: req._("LUInet - Available Genie Templates"),
            templates
        });
    }).catch(next);
});

module.exports = router;
