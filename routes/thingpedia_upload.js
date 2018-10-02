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
                                                     device: { fullcode: false,
                                                               code: code,
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

function doCreateOrUpdate(id, create, req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var kind = req.body.primary_kind;
    var approve = !!req.body.approve;

    var gAst = undefined;

    Q.try(() => {
        return db.withTransaction((dbClient) => {
            return Promise.resolve().then(() => {
                if (create && (!req.files.icon || !req.files.icon.length))
                    throw new Error(req._("An icon must be specified for new devices"));
                return Importer.validateDevice(dbClient, req);
            }).catch((e) => {
                res.render('thingpedia_device_create_or_edit', { page_title:
                                                                 (create ?
                                                                  req._("Thingpedia - create new device") :
                                                                  req._("Thingpedia - edit device")),
                                                                 csrfToken: req.csrfToken(),
                                                                 error: e,
                                                                 id: id,
                                                                 device: { name: name,
                                                                           primary_kind: kind,
                                                                           description: description,
                                                                           code: code },
                                                                 create: create });
                return null;
            }).then((ast) => {
                if (ast === null)
                    return null;

                return Importer.ensurePrimarySchema(dbClient, name, kind, ast, req, approve).then(() => ast);
            }).then((ast) => {
                if (ast === null)
                    return null;

                var extraKinds = ast.types;
                var extraChildKinds = ast.child_types;

                var fullcode = Importer.isFullCode(ast.module_type);

                var obj = {
                    primary_kind: kind,
                    name: name,
                    description: description,
                    fullcode: fullcode,
                    module_type: ast.module_type,
                    category: ast.category,
                    subcategory: ast.subcategory,
                };
                var code = JSON.stringify(ast);
                gAst = ast;

                if (create) {
                    obj.owner = req.user.developer_org;
                    if (req.user.developer_status < user.DeveloperStatus.TRUSTED_DEVELOPER ||
                        !approve) {
                        obj.approved_version = null;
                        obj.developer_version = 0;
                    } else {
                        obj.approved_version = 0;
                        obj.developer_version = 0;
                    }
                    return model.create(dbClient, obj, extraKinds, extraChildKinds, code)
                        .then(() => {
                            obj.old_version = null;
                            return obj;
                        });
                } else {
                    return model.get(dbClient, id).then((old) => {
                        if (old.owner !== req.user.developer_org &&
                            req.user.developer_status < user.DeveloperStatus.ADMIN)
                            throw new Error(req._("Not Authorized"));

                        obj.owner = old.owner;
                        obj.developer_version = old.developer_version + 1;
                        if (req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER &&
                            approve)
                            obj.approved_version = obj.developer_version;

                        return model.update(dbClient, id, obj, extraKinds, extraChildKinds, code)
                            .then(() => {
                                obj.old_version = old.developer_version;
                                return obj;
                            });
                    });
                }
            }).then(async (obj) => {
                if (obj === null)
                    return null;

                if (obj.fullcode || gAst.module_type === 'org.thingpedia.builtin')
                    return obj.primary_kind;

                const zipFile = req.files && req.files.zipfile && req.files.zipfile.length ?
                    req.files.zipfile[0] : null;

                let stream;
                if (zipFile !== null)
                    stream = fs.createReadStream(zipFile.path);
                else if (obj.old_version !== null)
                    stream = code_storage.downloadZipFile(obj.primary_kind, obj.old_version);
                else
                    throw new Error(req._("Invalid zip file"));

                if (zipFile && isJavaScript(zipFile))
                    await Importer.uploadJavaScript(req, obj, gAst, stream);
                else
                    await Importer.uploadZipFile(req, obj, gAst, stream);

                return obj.primary_kind;
            }).then((done) => {
                if (!done)
                    return done;

                if (req.files.icon && req.files.icon.length) {
                    // upload the icon asynchronously to avoid blocking the request
                    setTimeout(() => {
                        Importer.uploadIcon(done, req.files.icon[0].path);
                    }, 0);
                }

                // trigger the training server if configured
                TrainingServer.get().queue('en', done);
                return done;
            });
        }).then((done) => { // end of DB transaction
            if (!done)
                return done;

            // trigger updating the device on the user
            return tryUpdateDevice(done, req.user.id).then(() => done);
        }).then((done) => {
            console.log('done', done);
            if (!done)
                return;
            res.redirect('/thingpedia/devices/by-id/' + done);
        });
    }).finally(() => {
        var toDelete = [];
        if (req.files) {
            if (req.files.zipfile && req.files.zipfile.length)
                toDelete.push(Q.nfcall(fs.unlink, req.files.zipfile[0].path));
        }
        return Promise.all(toDelete);
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).render('error', { page_title: "Thingpedia - Error",
                                          message: e });
    }).done();
}

router.post('/create', user.requireLogIn, user.requireDeveloper(), (req, res) => {
    doCreateOrUpdate(undefined, true, req, res);
});

router.get('/update/:id', user.redirectLogIn, user.requireDeveloper(), (req, res, next) => {
    Promise.resolve().then(() => {
        return db.withClient(async (dbClient) => {
            const d = await model.get(dbClient, req.params.id);
            if (d.owner !== req.user.developer_org &&
                req.user.developer < user.DeveloperStatus.ADMIN)
                throw new Error(req._("Not Authorized"));

            let [{code}, examples] = await Promise.all([
                model.getCodeByVersion(dbClient, req.params.id, d.developer_version),
                exampleModel.getBaseBySchemaKind(dbClient, d.primary_kind, 'en')
            ]);

            code = JSON.stringify(Importer.migrateManifest(code, d), undefined, 2);
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

router.post('/update/:id', user.requireLogIn, user.requireDeveloper(), (req, res) => {
    doCreateOrUpdate(req.params.id, false, req, res);
});

router.get('/example/:id', (req, res, next) => {
    Promise.resolve().then(() => {
        // quotes, giphy, linkedin, tv, bodytrace
        if (['350', '229', '9', '280', '3', '421'].indexOf(req.params.id) === -1) {
            res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Example not found.") });
            return Promise.resolve();
        }

        return db.withClient((dbClient) => {
            return model.get(dbClient, req.params.id).then((d) => {
                return model.getCodeByVersion(dbClient, req.params.id, d.developer_version).then((row) => {
                    d.code = Importer.migrateManifest(row.code, d);
                    let ast = JSON.parse(d.code);
                    if ('client_id' in ast.auth)
                        ast.auth.client_id = '*** your-own-client-id ***';
                    if ('client_secret' in ast.auth)
                        ast.auth.client_secret = '*** your-own-client-secret ***';
                    d.code = JSON.stringify(ast);
                    return d;
                });
            }).then((d) => {
                res.render('thingpedia_device_example', { page_title: req._("Thingpedia - example"),
                                                          csrfToken: req.csrfToken(),
                                                          id: req.params.id,
                                                          device: { name: d.name,
                                                                    primary_kind: d.primary_kind,
                                                                    description: d.description,
                                                                    code: d.code,
                                                                    fullcode: d.fullcode },
                                                        });
            });
        });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).catch(next);
});

module.exports = router;
