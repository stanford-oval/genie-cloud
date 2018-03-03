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

const Config = require('../config');

const db = require('../util/db');
const model = require('../model/device');
const user = require('../util/user');
const schema = require('../model/schema');
const exampleModel = require('../model/example');

var router = express.Router();

router.get('/', (req, res) => {
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

router.get('/search', (req, res) => {
    var q = req.query.q;
    if (!q) {
        res.redirect('/thingpedia/devices');
        return;
    }

    db.withTransaction((client) => {
        return model.getByFuzzySearch(client, q).then((devices) => {
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
    return (locale || 'en').split(/[-_@.]/)[0];
}

function getDetails(fn, param, req, res) {
    var language = req.user ? localeToLanguage(req.user.locale) : 'en';

    Promise.resolve().then(() => {
        return db.withClient((client) => {
            return fn(client, param).then((d) => {
                return Promise.resolve().then(() => {
                    if (req.user && (req.user.developer_org === d.owner ||
                        req.user.developer_status >= user.DeveloperStatus.ADMIN))
                        return model.getCodeByVersion(client, d.id, d.developer_version);
                    else
                        return model.getCodeByVersion(client, d.id, d.approved_version);
                }).then((row) => {
                    d.code = row.code;
                    return d;
                });
            }).then((d) => {
                if (language === 'en') {
                    d.translated = true;
                    return d;
                }
                return schema.isKindTranslated(client, d.primary_kind, language).then((t) => {
                    d.translated = t;
                    return d;
                });
            }).then((d) => {
                return exampleModel.getByKinds(client, [d.primary_kind], language).then((examples) => {
                    d.examples = examples;
                    return d;
                });
            });
        }).then((d) => {
            var online = false;

            d.types = [];
            d.child_types = [];
            var actions = {}, queries = {};
            var ast = JSON.parse(d.code);
            d.types = ast.types || [];
            d.child_types = ast.child_types || [];

            actions = ast.actions || {};
            queries = ast.queries || {};

            var title;
            if (online)
                title = req._("Thingpedia - Account details");
            else
                title = req._("Thingpedia - Device details");

            res.render('thingpedia_device_details', { page_title: title,
                                                      S3_CLOUDFRONT_HOST: Config.S3_CLOUDFRONT_HOST,
                                                      csrfToken: req.csrfToken(),
                                                      device: d,
                                                      actions: actions,
                                                      queries: queries });
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
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
