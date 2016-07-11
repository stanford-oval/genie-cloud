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

const Config = require('../config');

const db = require('../util/db');
const model = require('../model/device');
const user = require('../util/user');
const organization = require('../model/organization');
const schema = require('../model/schema');

const EngineManager = require('../lib/enginemanager');

var router = express.Router();

router.get('/', function(req, res) {
    var page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient(function(client) {
        return model.getAll(client, page * 18, 18).then(function(devices) {
            res.render('thingpedia_dev_portal', { page_title: "ThingPedia Developer Portal",
                                                  S3_CLOUDFRONT_HOST: Config.S3_CLOUDFRONT_HOST,
                                                  csrfToken: req.csrfToken(),
                                                  devices: devices,
                                                  page_num: page,
                                                  isRunning: (req.user ? EngineManager.get().isRunning(req.user.id) : false) });
        });
    }).done();
});

function getDetails(fn, param, req, res) {
    Q.try(function() {
        return db.withClient(function(client) {
            return fn(client, param).tap(function(d) {
                return Q.try(function() {
                    if (req.user && req.user.developer_org === d.owner)
                        return model.getCodeByVersion(client, d.id, d.developer_version);
                    else
                        return model.getCodeByVersion(client, d.id, d.approved_version);
                }).then(function(row) { d.code = row.code; })
                .catch(function(e) { d.code = null; });
            });
        }).then(function(d) {
            var online = false;

            d.types = [];
            d.child_types = [];
            var triggers = [], actions = [], queries = [];
            try {
                var ast = JSON.parse(d.code);
                d.types = ast.types || [];
                online = d.types.some(function(k) { return k === 'online-account' });
                d.child_types = ast.child_types || [];

                if (ast.triggers) {
                    for (var t in ast.triggers) {
                        var obj = {
                            name: t
                        };
                        if (ast.triggers[t].params)
                            obj.params = ast.triggers[t].params;
                        else if (ast.triggers[t].args)
                            obj.params = ast.triggers[t].args;
                        else
                            obj.params = [];
                        obj.schema = ast.triggers[t].schema;
                        obj.doc = ast.triggers[t].doc;
                        triggers.push(obj);
                    }
                }
                if (ast.actions) {
                    for (var a in ast.actions) {
                        var obj = {
                            name: a
                        };
                        if (ast.actions[a].params)
                            obj.params = ast.actions[a].params;
                        else if (ast.actions[a].args)
                            obj.params = ast.actions[a].args;
                        else
                            obj.params = [];
                        obj.schema = ast.actions[a].schema;
                        obj.doc = ast.actions[a].doc;
                        actions.push(obj);
                    }
                }
                if (ast.queries) {
                    for (var q in ast.queries) {
                        var obj = {
                            name: q
                        };
                        if (ast.queries[q].params)
                            obj.params = ast.queries[q].params;
                        else if (ast.queries[q].args)
                            obj.params = ast.queries[q].args;
                        else
                            obj.params = [];
                        obj.schema = ast.queries[q].schema;
                        obj.doc = ast.queries[q].doc;
                        queries.push(obj);
                    }
                }
            } catch(e) {}

            var title;
            if (online)
                title = "ThingPedia - Account details";
            else
                title = "ThingPedia - Device details";

            res.render('thingpedia_device_details', { page_title: title,
                                                      S3_CLOUDFRONT_HOST: Config.S3_CLOUDFRONT_HOST,
                                                      csrfToken: req.csrfToken(),
                                                      device: d,
                                                      triggers: triggers,
                                                      actions: actions,
                                                      queries: queries,
                                                      online: online });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
}

router.get('/details/:id', function(req, res) {
    getDetails(model.get, req.params.id, req, res);
});

const LEGACY_MAPS = {
    'omlet': 'org.thingpedia.builtin.omlet',
    'linkedin': 'com.linkedin',
    'bodytrace-scale': 'com.bodytrace.scale',
    'twitter-account': 'com.twitter',
    'google-account': 'com.google',
    'facebook': 'com.facebook',
};

router.get('/by-id/:kind', function(req, res) {
    if (req.params.kind in LEGACY_MAPS)
        req.params.kind = LEGACY_MAPS[req.params.kind];
    getDetails(model.getByPrimaryKind, req.params.kind, req, res);
});

router.post('/approve/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(device) {
            return model.approve(dbClient, req.params.id).then(function() {
                return schema.approveByKind(dbClient, device.primary_kind);
            }).then(function() {
                if (device.global_name)
                    return schema.approveByKind(dbClient, device.global_name);
            });
        });
    }).then(function() {
        res.redirect('/thingpedia/devices/details/' + req.params.id);
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/delete/:id', user.requireLogIn, user.requireDeveloper(),  function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(row) {
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

module.exports = router;
