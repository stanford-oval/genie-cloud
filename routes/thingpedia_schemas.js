// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const passport = require('passport');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/schema');
const Validation = require('../util/validation');
const generateExamples = require('../util/generate_examples');
const ManifestToSchema = require('../util/manifest_to_schema');

var router = express.Router();

router.get('/by-id/:kind', function(req, res) {
    db.withClient(function(dbClient) {
        return model.getMetasByKinds(dbClient, req.params.kind, req.user ? req.user.developer_org : null);
    }).then(function(rows) {
        if (rows.length === 0) {
            res.status(404).render('error', { page_title: "ThingPedia - Error",
                                              message: 'Not Found' });
            return;
        }

        var row = rows[0];
        res.render('thingpedia_schema', { page_title: 'ThingPedia - Schema detail',
                                          csrfToken: req.csrfToken(),
                                          schema: row,
                                          triggers: row.triggers,
                                          actions: row.actions,
                                          queries: row.queries });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/approve/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(schema) {
            if (schema.kind_type !== 'other')
                throw new Error('This schema is associated with a device and should not be manipulated directly');
            return model.approve(dbClient, req.params.id).then(function() {
                res.redirect(303, '/thingpedia/schemas/by-id/' + schema.kind);
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/delete/:id', user.requireLogIn, user.requireDeveloper(),  function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(row) {
            if (row.kind_type !== 'other')
                throw new Error('This schema is associated with a device and should not be manipulated directly');
            if (row.owner !== req.user.developer_org && req.user.developer_status < user.DeveloperStatus.ADMIN) {
                res.status(403).render('error', { page_title: "ThingPedia - Error",
                                                  message: "Not Authorized" });
                return;
            }

            return model.delete(dbClient, req.params.id).then(function() {
                res.redirect(303, '/thingpedia/devices');
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
});

// only allow admins to deal with global schemas for now...
router.get('/create', user.redirectLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    res.render('thingpedia_schema_edit', { page_title: "ThingPedia - Create new Type",
                                           create: true,
                                           csrfToken: req.csrfToken(),
                                           schema: { kind: '',
                                                     code: JSON.stringify({
                                                         triggers: {},
                                                         actions: {},
                                                         queries: {}
                                          })}})
});

function validateSchema(dbClient, req) {
    var code = req.body.code;
    var kind = req.body.kind;

    if (!code || !kind)
        throw new Error('Not all required fields were presents');

    var ast = JSON.parse(code);
    Validation.validateAllInvocations(ast);
    return ast;
}

function doCreateOrUpdate(id, create, req, res) {
    var code = req.body.code;
    var kind = req.body.kind;
    var approve = !!req.body.approve;

    var gAst = undefined;

    Q.try(function() {
        return db.withTransaction(function(dbClient) {
            return Q.try(function() {
                return validateSchema(dbClient, req);
            }).catch(function(e) {
                console.error(e.stack);
                res.render('thingpedia_schema_edit', { page_title:
                                                       (create ?
                                                        "ThingPedia - create new type" :
                                                        "ThingPedia - edit type"),
                                                       csrfToken: req.csrfToken(),
                                                       error: e,
                                                       id: id,
                                                       schema: { kind: kind,
                                                                 code: code },
                                                       create: create });
                return null;
            }).then(function(ast) {
                if (ast === null)
                    return null;

                gAst = ast;
                var res = ManifestToSchema.toSchema(ast);
                var types = res[0];
                var meta = res[1];
                var obj = {
                    kind: kind,
                };

                if (create) {
                    obj.kind_type = 'other';
                    obj.owner = req.user.developer_org;
                    if (req.user.developer_status < user.DeveloperStatus.TRUSTED_DEVELOPER ||
                        !approve) {
                        obj.approved_version = null;
                        obj.developer_version = 0;
                    } else {
                        obj.approved_version = 0;
                        obj.developer_version = 0;
                    }
                    return model.create(dbClient, obj, types, meta);
                } else {
                    return model.get(dbClient, id).then(function(old) {
                        if (old.owner !== req.user.developer_org &&
                            req.user.developer_status < user.DeveloperStatus.ADMIN)
                            throw new Error("Not Authorized");
                        if (old.kind_type !== 'other')
                            throw new Error('Only non-device specific types can be modified from this page.'
                                + ' Upload a new interface package to modify a device type');

                        obj.developer_version = old.developer_version + 1;
                        if (req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER &&
                            approve)
                            obj.approved_version = obj.developer_version;

                        return model.update(dbClient, id, obj.kind, obj, types, meta);
                    });
                }
            }).tap(function(obj) {
                if (obj === null)
                    return null;

                return generateExamples(dbClient, kind, gAst);
            }).then(function(obj) {
                if (obj === null)
                    return;

                res.redirect('/thingpedia/schemas/by-id/' + obj.kind);
            });
        });
    }).catch(function(e) {
        console.error(e.stack);
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
}

// restrict generic type creation to admins
router.post('/create', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    doCreateOrUpdate(undefined, true, req, res);
});

router.get('/update/:id', user.redirectLogIn, user.requireDeveloper(), function(req, res) {
    Q.try(function() {
        return db.withClient(function(dbClient) {
            return model.get(dbClient, req.params.id).then(function(d) {
                if (d.owner !== req.user.developer_org &&
                    req.user.developer < user.DeveloperStatus.ADMIN)
                    throw new Error("Not Authorized");
                if (d.kind_type !== 'other')
                    throw new Error('Only non-device specific types can be modified from this page.'
                        + ' Upload a new interface package to modify a device type');

                return model.getTypesAndMeta(dbClient, req.params.id, d.developer_version).then(function(row) {
                    d.types = JSON.parse(row.types);
                    d.meta = JSON.parse(row.meta);
                    return d;
                });
            }).then(function(d) {
                var ast = ManifestToSchema.toManifest(d.types, d.meta);
                d.code = JSON.stringify(ast);
                res.render('thingpedia_schema_edit', { page_title: "ThingPedia - edit type",
                                                       csrfToken: req.csrfToken(),
                                                       id: req.params.id,
                                                       schema: d,
                                                       create: false });
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/update/:id', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    doCreateOrUpdate(req.params.id, false, req, res);
});

module.exports = router;
