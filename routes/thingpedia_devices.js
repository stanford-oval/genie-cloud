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
const TrainingServer = require('../util/training_server');
const SendMail = require('../util/sendmail');

var router = express.Router();

router.get('/', (req, res) => {
    res.redirect(301, '/thingpedia');
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
                    else if (d.approved_version !== null)
                        return model.getCodeByVersion(client, d.id, d.approved_version);
                    else
                        return Promise.resolve({code:'{}'});
                }).then((row) => {
                    d.code = row.code;
                    return d;
                });
            }).then((d) => {
                return Promise.all([Promise.resolve().then(() => {
                    if (language === 'en') {
                        d.translated = true;
                        return;
                    }
                    return schema.isKindTranslated(client, d.primary_kind, language).then((t) => {
                        d.translated = t;
                        return;
                     });
                }), exampleModel.getByKinds(client, [d.primary_kind], language).then((examples) => {
                    d.examples = examples;
                }), TrainingServer.get().check(language, d.primary_kind).then((job) => {
                    d.current_job = job;
                })]).then(() => d);
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

router.get('/by-id/:kind', (req, res) => {
    getDetails(model.getByPrimaryKind, req.params.kind, req, res);
});

router.post('/approve/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((device) => {
            return model.approve(dbClient, req.params.id).then(() => {
                return schema.approveByKind(dbClient, device.primary_kind);
            }).then(() => device);
        });
    }).then((device) => {
        res.redirect('/thingpedia/devices/by-id/' + device.primary_kind);
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/unapprove/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((device) => {
            return model.unapprove(dbClient, req.params.id).then(() => {
                return schema.unapproveByKind(dbClient, device.primary_kind);
            }).then(() => device);
        });
    }).then((device) => {
        res.redirect('/thingpedia/devices/by-id/' + device.primary_kind);
    }).catch((e) => {
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

router.post('/request-approval', user.requireLogIn, user.requireDeveloper(), (req, res) => {
    var mailOptions = {
        from: 'Thingpedia <noreply@thingpedia.stanford.edu>',
        to: 'gcampagn@cs.stanford.edu',
        subject: `Review Request for ${req.body.kind}`,
        replyTo: {
            name: req.user.human_name,
            address: req.user.email
        },
        text:
`${req.user.human_name} (${req.user.username}) requests a review of ${req.body.kind}.
Link: https://almond.stanford.edu/thingpedia/devices/by-id/${req.body.kind}

Comments:
${(req.body.comments || '').trim()}
`
    };

    SendMail.send(mailOptions).then(function() {
        res.redirect(301, '/thingpedia/devices/by-id/' + req.body.kind);
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
});

module.exports = router;
