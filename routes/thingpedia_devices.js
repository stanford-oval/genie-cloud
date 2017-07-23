// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
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
const exampleModel = require('../model/example');

var router = express.Router();

router.get('/', function(req, res) {
    var page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((client) => {
        let devices;
        if (req.user && req.user.developer_status >= user.DeveloperStatus.ADMIN)
            devices = model.getAll(client, page * 18, 19);
        else
            devices = model.getAllApproved(client, page * 18, 19, req.user ? req.user.developer_org : null);
        return devices.then((devices) => {
            res.render('thingpedia_device_list', { page_title: req._("Thingpedia - Supported Devices"),
                                                   page_h1: req._("Supported Devices"),
                                                   csrfToken: req.csrfToken(),
                                                   devices: devices,
                                                   page_num: page });
        });
    }).done();
});

router.get('/search', function(req, res) {
    var q = req.query.q;
    if (!q) {
        res.redirect('/thingpedia/devices');
        return;
    }

    db.withTransaction(function(client) {
        return model.getByFuzzySearch(client, q).then(function(devices) {
            var kinds = new Set;
            devices = devices.filter((d) => {
                if (kinds.has(d.primary_kind))
                    return false;
                kinds.add(d.primary_kind);
                return true;
            });

            res.render('thingpedia_device_list', { page_title: req._("Thingpedia - Supported Devices"),
                                                   page_h1: req._("Results of Your Search"),
                                                   csrfToken: req.csrfToken(),
                                                   devices: devices });
        });
    }).done();
});

function localeToLanguage(locale) {
    // only keep the language part of the locale, we don't
    // yet distinguish en_US from en_GB
    return (locale || 'en').split(/[-_\@\.]/)[0];
}

function getDetails(fn, param, req, res) {
    var language = req.user ? localeToLanguage(req.user.locale) : 'en';

    Q.try(function() {
        return db.withClient(function(client) {
            return fn(client, param).tap(function(d) {
                return Q.try(function() {
                    if (req.user && (req.user.developer_org === d.owner ||
                        req.user.developer_status >= user.DeveloperStatus.ADMIN))
                        return model.getCodeByVersion(client, d.id, d.developer_version);
                    else
                        return model.getCodeByVersion(client, d.id, d.approved_version);
                }).then(function(row) { d.code = row.code; })
                .catch(function(e) { d.code = null; });
            }).tap(function(d) {
                if (language === 'en') {
                    d.translated = true;
                    return;
                }
                return schema.isKindTranslated(client, d.primary_kind, language).then(function(t) {
                    d.translated = t;
                });
            }).tap(function(d) {
                var minClickCount = 0;
                if (req.user && req.user.developer_status >= user.DeveloperStatus.ADMIN)
                    minClickCount = -1;

                return exampleModel.getByKinds(client, true, [d.primary_kind], language, minClickCount).then(function(examples) {
                    d.examples = examples;
                });
            })
        }).then(function(d) {
            var online = false;

            d.types = [];
            d.child_types = [];
            var triggers = {}, actions = {}, queries = {};
            try {
                var ast = JSON.parse(d.code);
                d.types = ast.types || [];
                online = d.types.some(function(k) { return k === 'online-account' });
                d.child_types = ast.child_types || [];

                triggers = ast.triggers || {};
                actions = ast.actions || {};
                queries = ast.queries || {};
            } catch(e) {}

            var title;
            if (online)
                title = req._("Thingpedia - Account details");
            else
                title = req._("Thingpedia - Device details");

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
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
}

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
            }).then(() => device);
        });
    }).then(function(device) {
        res.redirect('/thingpedia/devices/by-id/' + device.primary_kind);
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/delete/:id', user.requireLogIn, user.requireDeveloper(),  function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(row) {
            if (row.owner !== req.user.developer_org && req.user.developer_status < user.DeveloperStatus.ADMIN) {
                res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("Not Authorized") });
                return;
            }

            return model.delete(dbClient, req.params.id).then(function() {
                res.redirect(303, '/thingpedia/devices');
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e.message });
    }).done();
});

module.exports = router;
