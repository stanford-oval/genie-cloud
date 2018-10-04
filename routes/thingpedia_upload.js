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

const Q = require('q');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const csurf = require('csurf');

const ThingTalk = require('thingtalk');

const platform = require('../util/platform');
const db = require('../util/db');
const model = require('../model/device');
const exampleModel = require('../model/example');

const code_storage = require('../util/code_storage');
const TrainingServer = require('../util/training_server');
const Importer = require('../util/import_device');
const DatasetUtils = require('../util/dataset');

const user = require('../util/user');
const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

router.use(multer({ dest: platform.getTmpDir() }).fields([
    { name: 'zipfile', maxCount: 1 },
    { name: 'icon', maxCount: 1 }
]));
router.use(csurf({ cookie: false }));

const DEFAULT_CODE = {"module_type": "org.thingpedia.v2",
                      "params": {},
                      "auth": {"type": "none"},
                      "types": [],
                      "child_types": [],
                      "queries": {},
                      "actions": {},
                    };

router.get('/create', user.redirectLogIn, user.requireDeveloper(), (req, res) => {
    var code = JSON.stringify(DEFAULT_CODE, undefined, 2);
    res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - create new device"),
                                                     csrfToken: req.csrfToken(),
                                                     device: { code: code,
                                                               dataset: '' },
                                                     create: true });
});

function tryUpdateDevice(primaryKind, userId) {
    // do the update asynchronously - if the update fails, the user will
    // have another chance from the status page
    EngineManager.get().getEngine(userId).then((engine) => {
        return engine.devices.updateDevicesOfKind(primaryKind);
    }).catch((e) => {
        console.error(`Failed to auto-update device ${primaryKind} for user ${userId}: ${e.message}`);
    });

    return Promise.resolve();
}

function isJavaScript(file) {
    return file.mimetype === 'application/javascript' ||
        file.mimetype === 'text/javascript' ||
        (file.originalname && file.originalname.endsWith('.js'));
}

async function doCreateOrUpdate(id, create, req, res) {
    const kind = req.body.primary_kind;
    const approve = req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER &&
        !!req.body.approve;

    try {
        const ok = await db.withTransaction(async (dbClient) => {
            let classDef;
            let dataset;
            let old = null;
            try {
                [classDef, dataset] = await Importer.validateDevice(dbClient, req, req.body,
                                                                    req.body.code, req.body.dataset);
                if (create) {
                    if (!req.files.icon || !req.files.icon.length)
                        throw new Error(req._("An icon must be specified for new devices"));
                } else {
                    try {
                        old = await model.get(dbClient, id);
                    } catch(e) {
                        throw new Error(req._("Existing device not found"));
                    }
                    if (old.owner !== req.user.developer_org &&
                        req.user.developer_status < user.DeveloperStatus.ADMIN)
                        throw new Error(req._("Existing device not found"));
                }
            } catch(e) {
                res.render('thingpedia_device_create_or_edit', { page_title:
                                                                 (create ?
                                                                  req._("Thingpedia - create new device") :
                                                                  req._("Thingpedia - edit device")),
                                                                 csrfToken: req.csrfToken(),
                                                                 error: e,
                                                                 id: id,
                                                                 device: req.body,
                                                                 create: create });
                return false;
            }

            const schemaId = await Importer.ensurePrimarySchema(dbClient, req.body.name,
                                                                classDef, req, approve);
            await Importer.ensureDataset(dbClient, schemaId, dataset);

            const extraKinds = classDef.extends;
            const extraChildKinds = classDef.annotations.child_types ?
                classDef.annotations.child_types.toJS() : [];

            const fullcode = Importer.isFullCode(classDef);

            const developer_version = create ? 0 : old.developer_version + 1;
            classDef.annotations.version = ThingTalk.Ast.Value.Number(developer_version);

            const generalInfo = {
                primary_kind: kind,
                name: req.body.name,
                description: req.body.description,
                category: Importer.getCategory(classDef),
                subcategory: req.body.subcategory,
                source_code: req.body.code,
                developer_version: developer_version,
                approved_version: approve ? developer_version : null,
            };

            const factory = Importer.makeDeviceFactory(classDef, generalInfo);
            const versionedInfo = {
                code: classDef.prettyprint(),
                factory: JSON.stringify(factory),
                module_type: classDef.loader.module,
                fullcode: fullcode
            };

            if (create) {
                generalInfo.owner = req.user.developer_org;
                await model.create(dbClient, generalInfo, extraKinds, extraChildKinds, versionedInfo);
            } else {
                generalInfo.owner = old.owner;
                await model.update(dbClient, id, generalInfo, extraKinds, extraChildKinds, versionedInfo);
            }

            if (!fullcode) {
                const zipFile = req.files && req.files.zipfile && req.files.zipfile.length ?
                    req.files.zipfile[0] : null;

                let stream;
                if (zipFile !== null)
                    stream = fs.createReadStream(zipFile.path);
                else if (old !== null)
                    stream = code_storage.downloadZipFile(kind, old.developer_version);
                else
                    throw new Error(req._("Invalid zip file"));

                if (zipFile && isJavaScript(zipFile))
                    await Importer.uploadJavaScript(req, generalInfo, stream);
                else
                    await Importer.uploadZipFile(req, generalInfo, stream);
            }

            if (req.files.icon && req.files.icon.length) {
                // upload the icon asynchronously to avoid blocking the request
                setTimeout(() => {
                    Importer.uploadIcon(kind, req.files.icon[0].path);
                }, 0);
            }

            // trigger the training server if configured
            TrainingServer.get().queue('en', kind);

            return true;
        });

        if (ok) {
            // trigger updating the device on the user
            await tryUpdateDevice(kind, req.user.id);

            res.redirect('/thingpedia/devices/by-id/' + kind);
        }
    } finally {
        var toDelete = [];
        if (req.files) {
            if (req.files.zipfile && req.files.zipfile.length)
                toDelete.push(Q.nfcall(fs.unlink, req.files.zipfile[0].path));
        }
        await Promise.all(toDelete);
    }
}

router.post('/create', user.requireLogIn, user.requireDeveloper(), (req, res, next) => {
    doCreateOrUpdate(undefined, true, req, res).catch(next);
});

router.get('/update/:id', user.redirectLogIn, user.requireDeveloper(), (req, res, next) => {
    Promise.resolve().then(() => {
        return db.withClient(async (dbClient) => {
            const d = await model.get(dbClient, req.params.id);
            if (d.owner !== req.user.developer_org &&
                req.user.developer < user.DeveloperStatus.ADMIN)
                throw new Error(req._("Not Authorized"));

            let [code, examples] = await Promise.all([
                d.source_code || model.getCodeByVersion(dbClient, req.params.id, d.developer_version),
                exampleModel.getBaseBySchemaKind(dbClient, d.primary_kind, 'en')
            ]);

            code = Importer.migrateManifest(code, d);
            const dataset = DatasetUtils.examplesToDataset(d.primary_kind, 'en', examples,
                                                           { editMode: true });

            res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - edit device"),
                                                             id: req.params.id,
                                                             device: { name: d.name,
                                                                       primary_kind: d.primary_kind,
                                                                       description: d.description,
                                                                       code: code,
                                                                       dataset: dataset },
                                                             create: false });
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).catch(next);
});

router.post('/update/:id', user.requireLogIn, user.requireDeveloper(), (req, res, next) => {
    doCreateOrUpdate(req.params.id, false, req, res).catch(next);
});

module.exports = router;
