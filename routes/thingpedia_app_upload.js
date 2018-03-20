// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2017 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const express = require('express');
const multer = require('multer');
const csurf = require('csurf');

const ThingTalk = require('thingtalk');
const AppCompiler = ThingTalk.Compiler;
const SchemaRetriever = ThingTalk.SchemaRetriever;

const db = require('../util/db');
const code_storage = require('../util/code_storage');
const user = require('../util/user');
const model = require('../model/app');
const schema = require('../model/schema');
const exampleModel = require('../model/example');
const ThingPediaClient = require('../util/thingpedia-client');
const ManifestToSchema = require('../util/manifest_to_schema');

var router = express.Router();

router.use(multer({ dest: platform.getTmpDir() }).fields([
    { name: 'icon', maxCount: 1 }
]));
router.use(csurf({ cookie: false }));

var _schemaRetriever = new SchemaRetriever(new ThingPediaClient());

function validateApp(req, name, description, manifest, code) {
    var compiler = new AppCompiler();

    return Q.try(function() {
        if (!name || !description)
            throw new Error(req._("A app must have a name and a description"));
        if (!manifest.canonical || !manifest.confirmation)
            throw new Error(req._("A app must have a canonical command and a confirmation"));
        manifest.examples = manifest.examples || [];
        if (!(manifest.examples.length >= 1))
            throw new Error(req._("A app must have at least one example command"));
        manifest.args = manifest.args || [];

        compiler.setSchemaRetriever(_schemaRetriever);
        return compiler.verifyProgram(ThingTalk.Grammar.parse(code));
    }).then(() => {
        var params = Object.keys(compiler.params);
        var types = params.map((p) => compiler.params[p]);
        if (params.length !== manifest.args.length)
            throw new Error(req._("Invalid manifest"));
        manifest.args.forEach((a, i) => {
            a.name = params[i];
            a.type = String(types[i]);
            a.question = a.question || '';
            a.required = true;
        });
    }).then(() => {
        return compiler;
    })
}

function uploadIcon(appId, req) {
    if (req.files.icon && req.files.icon.length) {
        console.log('req.files.icon', req.files.icon);
        // upload the icon asynchronously to avoid blocking the request
        setTimeout(function() {
            console.log('uploading icon');
            Q.try(function() {
                var graphicsApi = platform.getCapability('graphics-api');
                var image = graphicsApi.createImageFromPath(req.files.icon[0].path);
                image.resizeFit(512, 512);
                return image.stream('png');
            }).spread(function(stdout, stderr) {
                return code_storage.storeIcon(stdout, 'app:' + appId);
            }).catch(function(e) {
                console.error('Failed to upload icon to S3: ' + e);
            }).done();
        }, 0);
    }
}

function ensureExamples(dbClient, schemaId, ast) {
    return exampleModel.deleteBySchema(dbClient, schemaId, 'en').then(() => {
        let examples = ast.examples.map((ex) => {
            return ({
                schema_id: schemaId,
                utterance: ex.utterance,
                preprocessed: ex.utterance,
                target_code: ex.program,
                target_json: '', // FIXME
                type: 'thingpedia',
                language: 'en',
                is_base: 1
            });
        });
        return exampleModel.createMany(dbClient, examples);
    });
}

router.post('/create', user.requireLogIn, (req, res) => {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var tags = req.body.tags || [];
    if (typeof req.body.root !== 'object' || req.body.root === null) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),

                                          message: "Invalid manifest" });
        return;
    }
    var manifest = req.body.root;

    return Q.try(function() {
        return validateApp(req, name, description, manifest, code);
    }).then(function(compiler) {
        return db.withTransaction(function(dbClient) {
            return model.create(dbClient, { owner: req.user.id,
                                            app_id: compiler.name,
                                            name: name,
                                            description: description,
                                            code: code }).tap(function(app) {
                return model.addTags(dbClient, app.id, tags);
            }).tap(function(app) {
                var fullManifest = {
                    triggers: {},
                    queries: {},
                    actions: {
                        invoke: manifest
                    }
                };
                var [types, meta] = ManifestToSchema.toSchema(fullManifest);
                return schema.create(dbClient, {
                    owner: null,
                    kind: compiler.name,
                    kind_canonical: compiler.name.replace(/[_\-]/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase(),
                    kind_type: 'app',
                    developer_version: 0,
                    approved_version: 0
                }, types, meta).then((schema) => {
                    return ensureExamples(dbClient, schema.id, fullManifest);
                });
            });
        });
    }).then(function(app) {
        uploadIcon(app.app_id, req);
        res.redirect('/thingpedia/apps/' + app.id);
    }).catch(function(err) {
        res.render('thingpedia_app_create', { error: err,
                                              op: 'create',
                                              csrfToken: req.csrfToken(),
                                              name: name,
                                              description: description,
                                              manifest: manifest,
                                              code: code,
                                              tags: tags });
    }).done();
});

router.post('/edit/:id(\\d+)', user.requireLogIn, function(req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var tags = req.body.tags || [];
    var manifest = req.body.root;
    if (typeof req.body.root !== 'object' || req.body.root === null) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),

                                          message: "Invalid manifest" });
        return;
    }

    Q.try(function() {
        return validateApp(req, name, description, manifest, code);
    }).then(function(compiler) {
        return db.withTransaction(function(dbClient) {
            return model.get(dbClient, req.params.id).then(function(r) {
                if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                    r.owner !== req.user.id) {
                    res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                      message: req._("You are not authorized to perform the requested operation.") });
                    return;
                }
                if (r.app_id !== compiler.name) {
                    res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                      message: req._("Modifying the app ID is not allowed, create a new app instead.") });
                    return;
                }

                return model.update(dbClient, req.params.id, { name: name,
                                                               description: description,
                                                               code: code })
                    .tap(function(app) {
                        return model.removeAllTags(dbClient, req.params.id);
                    })
                    .tap(function(app) {
                        return model.addTags(dbClient, req.params.id, tags);
                    })
                    .tap(function(app) {
                        var fullManifest = {
                            triggers: {},
                            queries: {},
                            actions: {
                                invoke: manifest
                            }
                        };
                        var [types, meta] = ManifestToSchema.toSchema(fullManifest);
                        return schema.getByKind(dbClient, compiler.name).then(function(old) {
                            var obj = {};
                            obj.developer_version = old.developer_version + 1;
                            obj.approved_version = obj.developer_version;

                            return schema.update(dbClient, old.id, old.kind, obj, types, meta);
                        }).then(() => {
                            return generateExamples(dbClient, compiler.name, fullManifest);
                        });
                    }).then(function(app) {
                        uploadIcon(compiler.name, req);
                        res.redirect(303, '/thingpedia/apps/' + req.params.id);
                    });
            });
        });
    }).catch(function(err) {
        res.render('thingpedia_app_create', { page_title: req._("Thingpedia - edit an app"),
                                              error: err,
                                              op: 'edit',
                                              csrfToken: req.csrfToken(),
                                              app_id: req.params.id,
                                              name: name,
                                              description: description,
                                              manifest: manifest,
                                              code: code,
                                              tags: tags });
    }).done();
});

module.exports = router;
