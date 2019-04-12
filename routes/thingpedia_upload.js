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
const Validation = require('../util/validation');
const Importer = require('../util/import_device');
const FactoryUtils = require('../util/device_factories');
const DatasetUtils = require('../util/dataset');
const iv = require('../util/input_validation');
const user = require('../util/user');
const { BadRequestError, ForbiddenError } = require('../util/errors');

const EngineManager = require('../almond/enginemanagerclient');

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
    res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - create new device"),
                                                     device: { code: '',
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

async function doCreateOrUpdate(kind, create, req, res) {
    if (create)
        kind = req.body.primary_kind;
    else
        req.body.primary_kind = kind;
    const approve = (req.user.roles & (user.Role.TRUSTED_DEVELOPER | user.Role.THINGPEDIA_ADMIN)) !== 0
        && !!req.body.approve;

    try {
        const ok = await db.withTransaction(async (dbClient) => {
            let classDef;
            let dataset;
            let old = null;
            try {
                [classDef, dataset] = await Validation.validateDevice(dbClient, req, req.body,
                                                                      req.body.code, req.body.dataset);
                if (create) {
                    if (!req.files.icon || !req.files.icon.length)
                        throw new BadRequestError(req._("An icon must be specified for new devices"));
                } else {
                    try {
                        old = await model.getByPrimaryKind(dbClient, kind);
                    } catch(e) {
                        throw new BadRequestError(req._("Existing device not found"));
                    }
                    if (old.owner !== req.user.developer_org &&
                        (req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0)
                        throw new BadRequestError(req._("Existing device not found"));
                }

                await Validation.tokenizeAllExamples('en', dataset.examples);
            } catch(e) {
                console.error(e.stack);
                res.render('thingpedia_device_create_or_edit', { page_title:
                                                                 (create ?
                                                                  req._("Thingpedia - create new device") :
                                                                  req._("Thingpedia - edit device")),
                                                                 error: e,
                                                                 device: req.body,
                                                                 create: create });
                return false;
            }

            const [schemaId, schemaChanged] = await Importer.ensurePrimarySchema(dbClient, req.body.name,
                                                                                 classDef, req, approve);
            const datasetChanged = await Importer.ensureDataset(dbClient, schemaId, dataset, req.body.dataset);

            const extraKinds = classDef.extends || [];
            const extraChildKinds = classDef.annotations.child_types ?
                classDef.annotations.child_types.toJS() : [];

            const downloadable = Importer.isDownloadable(classDef);

            const developer_version = create ? 0 : old.developer_version + 1;
            classDef.annotations.version = ThingTalk.Ast.Value.Number(developer_version);
            classDef.annotations.package_version = ThingTalk.Ast.Value.Number(developer_version);

            const generalInfo = {
                primary_kind: kind,
                name: req.body.name,
                description: req.body.description,
                license: req.body.license,
                license_gplcompatible: !!req.body.license_gplcompatible,
                website: req.body.website || '',
                repository: req.body.repository || '',
                issue_tracker: req.body.issue_tracker || '',
                category: Importer.getCategory(classDef),
                subcategory: req.body.subcategory,
                source_code: req.body.code,
                developer_version: developer_version,
                approved_version: approve ? developer_version :
                    (old !== null ? old.approved_version : null),
            };
            if (req.files.icon && req.files.icon.length)
                Object.assign(generalInfo, await Importer.uploadIcon(kind, req.files.icon[0].path));

            const discoveryServices = FactoryUtils.getDiscoveryServices(classDef);
            const factory = FactoryUtils.makeDeviceFactory(classDef, generalInfo);
            const versionedInfo = {
                code: classDef.prettyprint(),
                factory: JSON.stringify(factory),
                module_type: classDef.loader.module,
                downloadable: downloadable
            };

            if (create) {
                generalInfo.owner = req.user.developer_org;
                await model.create(dbClient, generalInfo, extraKinds, extraChildKinds, discoveryServices, versionedInfo);
            } else {
                generalInfo.owner = old.owner;
                await model.update(dbClient, old.id, generalInfo, extraKinds, extraChildKinds, discoveryServices, versionedInfo);
            }

            if (downloadable) {
                const zipFile = req.files && req.files.zipfile && req.files.zipfile.length ?
                    req.files.zipfile[0] : null;

                let stream;
                if (zipFile !== null)
                    stream = fs.createReadStream(zipFile.path);
                else if (old !== null)
                    stream = code_storage.downloadZipFile(kind, old.developer_version);
                else
                    throw new BadRequestError(req._("Invalid zip file"));

                if (zipFile && isJavaScript(zipFile))
                    await Importer.uploadJavaScript(req, generalInfo, stream);
                else
                    await Importer.uploadZipFile(req, generalInfo, stream);
            }

            if (schemaChanged || datasetChanged) {
                // trigger the training server if configured
                await TrainingServer.get().queue('en', [kind], 'update-dataset');
            }

            return true;
        }, 'repeatable read');

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

            res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - edit device"),
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
                                          message: e });
    }).catch(next);
});

router.post('/update/:kind', iv.validatePOST(updateArguments), (req, res, next) => {
    doCreateOrUpdate(req.params.kind, false, req, res).catch(next);
});

module.exports = router;
