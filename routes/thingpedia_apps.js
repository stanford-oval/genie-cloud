// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');

const ThingTalk = require('thingtalk');
const AppCompiler = ThingTalk.Compiler;
const SchemaRetriever = ThingTalk.SchemaRetriever;

const db = require('../util/db');
const user = require('../util/user');
const userModel = require('../model/user');
const model = require('../model/app');
const device = require('../model/device');
const schema = require('../model/schema');
const exampleModel = require('../model/example');
const ThingPediaClient = require('../util/thingpedia-client');
const generateExamples = require('../util/generate_examples');
const ManifestToSchema = require('../util/manifest_to_schema');

var router = express.Router();

function renderAppList(dbClient, apps, req, res, page_h1, page_num) {
    return Q.all(apps.map(function(r) {
        return model.getAllTags(dbClient, r.id).then(function(tags) {
            r.tags = tags;
            return r;
        });
    })).then(function(apps) {
        res.render('thingpedia_app_list', { page_title: req._("Thingpedia - app collection"),
                                            page_h1: page_h1,
                                            page_num: page_num,
                                            apps: apps });
    });
}

function filterVisible(req) {
    if (!req.user)
        return -1;
    if (req.user.developer_status >= user.DeveloperStatus.ADMIN)
        return null;
    else
        return req.user.id;
}

router.get('/', function(req, res) {
    var page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withTransaction(function(client) {
        return model.getAll(client, filterVisible(req), page * 18, 18).then(function(apps) {
            return renderAppList(client, apps, req, res,
                                 req._("Try the following recommended apps"), page);
        });
    }).done();
});

router.get('/search', function(req, res) {
    var q = req.query.q;
    if (!q) {
        res.redirect('/thingpedia/apps');
        return;
    }

    db.withTransaction(function(client) {
        return model.getByFuzzySearch(client, filterVisible(req), q).then(function(apps) {
            return renderAppList(client, apps, req, res,
                                 req._("Results of your search"));
        });
    }).done();
});

router.get('/by-tag/:tag', function(req, res) {
    var tag = req.params.tag;

    db.withTransaction(function(client) {
        return model.getByTag(client, filterVisible(req), tag).then(function(apps) {
            return renderAppList(client, apps, req, res,
                                 req._("Apps with tag “%s”").format(tag));
        });
    }).done();
});

router.get('/by-owner/:id(\\d+)', function(req, res) {
    db.withTransaction(function(client) {
        return userModel.get(client, req.params.id).then(function(user) {
            return model.getByOwner(client, filterVisible(req), req.params.id).then(function(apps) {
                var username = user.human_name || user.username;
                return renderAppList(client, apps, req, res,
                                     req._("Apps contributed by %s").format(username));
            });
        });
    }).done();
});

router.get('/create', user.redirectLogIn, function(req, res) {
    res.render('thingpedia_app_create', { page_title: req._("Thingpedia - create a new app"),
                                          csrfToken: req.csrfToken(),
                                          op: 'create',
                                          name: '',
                                          description: '',
                                          manifest: {
                                            args: [],
                                            canonical: '',
                                            confirmation: '',
                                            examples: []
                                          },
                                          tags: [] });
});

router.get('/:id(\\d+)', function(req, res) {
    db.withClient(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            return model.getAllTags(dbClient, r.id).then(function(tags) {
                r.tags = tags;
                return r;
            });
        });
    }).then(function(app) {
        if ((!req.user || (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                            app.owner !== req.user.id)) &&
            !app.visible) {
            res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("You are not authorized to perform the requested operation.") });
            return;
        }

        res.render('thingpedia_app_view', { page_title: req._("Thingpedia - app"),
                                            csrfToken: req.csrfToken(),
                                            app: app });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/delete/:id(\\d+)', user.requireLogIn, function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                r.owner !== req.user.id) {
                res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("You are not authorized to perform the requested operation.") });
                return;
            }

            return model.delete(dbClient, req.params.id).then(() => {
                return schema.deleteByKind(dbClient, r.app_id);
            });
        });
    }).then(function(app) {
        res.redirect('/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/set-visible/:id(\\d+)', user.requireLogIn, function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                r.owner !== req.user.id) {
                res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("You are not authorized to perform the requested operation.") });
                return;
            }

            return model.update(dbClient, req.params.id, { visible: true });
        });
    }).then(function(app) {
        res.redirect(303, '/thingpedia/apps/' + req.params.id);
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/set-invisible/:id(\\d+)', user.requireLogIn, function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                r.owner !== req.user.id) {
                res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("You are not authorized to perform the requested operation.") });
                return;
            }

            return model.update(dbClient, req.params.id, { visible: false });
        });
    }).then(function(app) {
        res.redirect(303, '/thingpedia/apps/' + req.params.id);
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.get('/edit/:id(\\d+)', user.redirectLogIn, function(req, res) {
    return db.withClient(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                r.owner !== req.user.id) {
                res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("You are not authorized to perform the requested operation.") });
                return;
            }
            return r;
        }).tap((r) => {
            if (!r)
                return;
            return model.getAllTags(dbClient, r.id).then(function(tags) {
                r.tags = tags;
                return r;
            });
        }).tap((r) => {
            if (!r)
                return;
            return schema.getTypesAndMetaByKind(dbClient, r.app_id).then(function(row) {
                var fullManifest = ManifestToSchema.toManifest(JSON.parse(row.types), JSON.parse(row.meta));
                r.manifest = fullManifest.actions.invoke;
                delete r.manifest.doc;

                return exampleModel.getBaseBySchemaKind(dbClient, r.app_id, 'en');
            }).then((examples) => {
                r.manifest.examples = examples.map((ex) => ex.utterance);
            });
        });
    }).then(function(app) {
        if (app === undefined)
            return;

        res.render('thingpedia_app_create', { page_title: req._("Thingpedia - edit an app"),
                                              op: 'edit',
                                              csrfToken: req.csrfToken(),
                                              app_id: app.id,
                                              name: app.name,
                                              description: app.description,
                                              manifest: app.manifest,
                                              code: app.code,
                                              tags: app.tags.map(function(t) { return t.tag; }) });
    }).catch(function(e) {
        console.error(e.stack);
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;
