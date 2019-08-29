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

const express = require('express');
const multer = require('multer');
const csurf = require('csurf');

const platform = require('../util/platform');
const db = require('../util/db');
const model = require('../model/device');
const exampleModel = require('../model/example');

const Importer = require('../util/import_device');
const DatasetUtils = require('../util/dataset');
const iv = require('../util/input_validation');
const user = require('../util/user');
const { ValidationError, BadRequestError, ForbiddenError } = require('../util/errors');

var router = express.Router();

router.use(multer({ dest: platform.getTmpDir() }).fields([
    { name: 'zipfile', maxCount: 1 },
    { name: 'icon', maxCount: 1 }
]));
router.use(csurf({ cookie: false }));
router.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});
router.use(user.requireLogIn, user.requireDeveloper());

router.get('/create', (req, res) => {
    res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - Create New Device"),
                                                     device: { code: '',
                                                               dataset: '' },
                                                     create: true });
});

async function doCreateOrUpdate(kind, create, req, res) {
    if (create)
        kind = req.body.primary_kind;
    else
        req.body.primary_kind = kind;

    try {
        await Importer.uploadDevice(req);
    } catch(e) {
        if (!(e instanceof ValidationError) && !(e instanceof BadRequestError))
            throw e;

        console.error(e.stack);
        res.render('thingpedia_device_create_or_edit', { page_title:
                                                         (create ?
                                                          req._("Thingpedia - Create New Device") :
                                                          req._("Thingpedia - Edit Device")),
                                                         error: e,
                                                         device: req.body,
                                                         create: create });
        return;
    }

    res.redirect('/thingpedia/devices/by-id/' + kind);
}

const updateArguments = {
    name: 'string',
    description: 'string',
    license: 'string',
    license_gplcompatible: 'boolean',
    website: '?string',
    repository: '?string',
    issue_tracker: '?string',
    subcategory: 'string',
    code: 'string',
    dataset: 'string',
    approve: 'boolean'
};
const createArguments = {};
Object.assign(createArguments, updateArguments);
createArguments.primary_kind = 'string';

router.post('/create', iv.validatePOST(createArguments), (req, res, next) => {
    doCreateOrUpdate(undefined, true, req, res).catch(next);
});

router.get('/update/:kind', (req, res, next) => {
    Promise.resolve().then(() => {
        return db.withClient(async (dbClient) => {
            const d = await model.getByPrimaryKind(dbClient, req.params.kind, true);
            if (d.owner !== req.user.developer_org &&
                (req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0)
                throw new ForbiddenError();

            let [code, examples] = await Promise.all([
                d.source_code || model.getCodeByVersion(dbClient, d.id, d.developer_version),
                exampleModel.getBaseBySchemaKind(dbClient, d.primary_kind, 'en')
            ]);

            code = Importer.migrateManifest(code, d);
            const dataset = DatasetUtils.examplesToDataset(d.primary_kind, 'en', examples,
                                                           { editMode: true });

            res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - Edit Device"),
                                                             id: d.id,
                                                             device: { name: d.name,
                                                                       primary_kind: d.primary_kind,
                                                                       description: d.description,
                                                                       subcategory: d.subcategory,
                                                                       website: d.website,
                                                                       license: d.license,
                                                                       license_gplcompatible: d.license_gplcompatible,
                                                                       repository: d.repository,
                                                                       issue_tracker: d.issue_tracker,
                                                                       code: code,
                                                                       dataset: dataset },
                                                             create: false });
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e.message });
    }).catch(next);
});

router.post('/update/:kind', iv.validatePOST(updateArguments), (req, res, next) => {
    doCreateOrUpdate(req.params.kind, false, req, res).catch(next);
});

module.exports = router;
