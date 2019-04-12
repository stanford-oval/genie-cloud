// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const express = require('express');

const ThingTalk = require('thingtalk');

const Config = require('../config');

const db = require('../util/db');
const model = require('../model/device');
const user = require('../util/user');
const schema = require('../model/schema');
const exampleModel = require('../model/example');
const TrainingServer = require('../util/training_server');
const SendMail = require('../util/sendmail');
const I18n = require('../util/i18n');
const tokenize = require('../util/tokenize');
const DatasetUtils = require('../util/dataset');
const Importer = require('../util/import_device');
const codeStorage = require('../util/code_storage');
const iv = require('../util/input_validation');
const { NotFoundError } = require('../util/errors');

var router = express.Router();

router.get('/', (req, res) => {
    res.redirect(301, '/thingpedia');
});

function getOrgId(req) {
    if (!req.user)
        return null;
    if ((req.user.roles & user.Role.THINGPEDIA_ADMIN) !== 0)
        return -1;
    else
        return req.user.developer_org;
}

function getDetails(fn, param, req, res) {
    const language = req.user ? I18n.localeToLanguage(req.user.locale) : 'en';

    return db.withClient(async (client) => {
        const device = await fn(client, param);

        let version;
        if ('version' in req.query && req.user && (req.user.roles & user.Role.THINGPEDIA_ADMIN) !== 0)
            version = parseInt(req.query.version);
        else if (req.user &&
                 (req.user.developer_org === device.owner || (req.user.roles & user.Role.THINGPEDIA_ADMIN) !== 0))
            version = device.developer_version;
        else
            version = device.approved_version;

        device.version = version;

        let [code, translated, examples, current_jobs] = await Promise.all([
            version !== null ? await model.getCodeByVersion(client, device.id, version) :
            `class @${device.primary_kind} {}`,

            language === 'en' ? true : schema.isKindTranslated(client, device.primary_kind, language),

            exampleModel.getByKinds(client, [device.primary_kind], getOrgId(req), language),
            TrainingServer.get().check(language, device.primary_kind)
        ]);
        device.translated = translated;
        device.current_jobs = current_jobs;

        var online = false;

        let migrated;
        try {
            migrated = Importer.migrateManifest(code, device);
        } catch(e) {
            // migrations can fail for a number of reasons on old versions,
            // we don't want an Internal Server Error every time
            // OTOH, we definitely want the error on the latest version, or
            // any approved version

            if (version === device.developer_version ||
                (device.approved_version !== null && version >= device.approved_version))
                throw e;
            console.log(`Failed to migrate ${device.primary_kind} at version ${version}: ${e}`);
            migrated = `class @${device.primary_kind} {}`;
        }
        const parsed = ThingTalk.Grammar.parse(migrated);
        assert(parsed.isMeta && parsed.classes.length > 0);
        const classDef = parsed.classes[0];

        examples = DatasetUtils.sortAndChunkExamples(examples);

        var title;
        if (online)
            title = req._("Thingpedia - Account details");
        else
            title = req._("Thingpedia - Device details");

        const downloadable = version !== null ? Importer.isDownloadable(classDef) : false;
        if (downloadable) {
            device.download_url = await codeStorage.getDownloadLocation(device.primary_kind, version,
                device.approved_version === null || version > device.approved_version);
        }

        res.render('thingpedia_device_details', { page_title: title,
                                                  CDN_HOST: Config.CDN_HOST,
                                                  csrfToken: req.csrfToken(),
                                                  device: device,
                                                  classDef: classDef,
                                                  examples: examples,
                                                  clean: tokenize.clean });
    }).catch((e) => {
        if (e.code !== 'ENOENT')
            throw e;

        res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
}

router.get('/by-id/:kind', iv.validateGET({ version: '?integer' }), (req, res, next) => {
    getDetails(model.getByPrimaryKind, req.params.kind, req, res).catch(next);
});

router.use(user.requireLogIn);

router.post('/approve', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validatePOST({ kind: 'string' }), (req, res, next) => {
    db.withTransaction((dbClient) => {
        return Promise.all([
            model.approve(dbClient, req.body.kind),
            schema.approveByKind(dbClient, req.body.kind)
        ]);
    }).then(() => {
        res.redirect(303, '/thingpedia/devices/by-id/' + req.body.kind);
    }).catch(next);
});

router.post('/unapprove', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validatePOST({ kind: 'string' }), (req, res, next) => {
    db.withTransaction((dbClient) => {
        return Promise.all([
            model.unapprove(dbClient, req.body.kind),
            schema.unapproveByKind(dbClient, req.body.kind)
        ]);
    }).then(() => {
        res.redirect(303, '/thingpedia/devices/by-id/' + req.body.kind);
    }).catch(next);
});

router.use(user.requireDeveloper());

router.post('/delete', iv.validatePOST({ kind: 'string' }), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const row = await model.getByPrimaryKind(dbClient, req.body.kind);
        if (row.owner !== req.user.developer_org &&
            (req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0) {
            // note that this must be exactly the same error used by util/db.js
            // so that a true not found is indistinguishable from not having permission
            throw new NotFoundError();
        }

        return model.delete(dbClient, row.id);
    }).then(() => {
        res.redirect(303, '/thingpedia/devices');
    }).catch(next);
});

router.post('/train', iv.validatePOST({ kind: 'string' }), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const row = await model.getByPrimaryKind(dbClient, req.body.kind);
        if (row.owner !== req.user.developer_org &&
            (req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0) {
            // note that this must be exactly the same error used by util/db.js
            // so that a true not found is indistinguishable from not having permission
            throw new NotFoundError();
        }

        return TrainingServer.get().queue('en', [req.body.kind], 'train');
    }).then(() => {
        res.redirect(303, '/thingpedia/devices/by-id/' + req.body.kind);
    }).catch(next);
});

router.post('/request-approval', iv.validatePOST({ kind: 'string', comments: '?string' }), (req, res, next) => {
    var mailOptions = {
        from: Config.EMAIL_FROM_ADMIN,
        to: Config.EMAIL_TO_ADMIN,
        subject: `Review Request for ${req.body.kind}`,
        replyTo: {
            name: req.user.human_name,
            address: req.user.email
        },
        text:
`${req.user.human_name} (${req.user.username}) requests a review of ${req.body.kind}.
Link: https://almond.stanford.edu/thingpedia/devices/by-id/${req.body.kind}

Comments:
${(req.body.comments || '').trim()}
`
    };

    SendMail.send(mailOptions).then(() => {
        res.redirect(303, '/thingpedia/devices/by-id/' + req.body.kind);
    }).catch(next);
});

module.exports = router;
