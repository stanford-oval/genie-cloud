// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const jade = require('jade');
const crypto = require('crypto');

const user = require('../util/user');
const model = require('../model/user');
const organization = require('../model/organization');
const db = require('../util/db');

const OmletOAuth = require('../omlet/oauth2');

function makeRandom() {
    return crypto.randomBytes(32).toString('hex');
}

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

router.get('/', user.redirectRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    db.withClient(function(dbClient) {
        return model.getAll(dbClient);
    }).tap(function(users) {
        return Q.all(users.map((u) => {
            return engineManager.getProcessId(u.id).then((pid) => {
                if (pid === -1) {
                    u.isRunning = false;
                    u.engineId = null;
                } else {
                    u.isRunning = true;
                    u.engineId = pid;
                }
            });
        }));
    }).then(function(users) {
        res.render('admin_user_list', { page_title: req._("Thingpedia - Administration"),
                                        csrfToken: req.csrfToken(),
                                        assistantAvailable: platform.getSharedPreferences().get('assistant') !== undefined,
                                        users: users });
    }).done();
});

router.post('/kill-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    engineManager.killUser(req.params.id);
    res.redirect(303, '/admin');
});

router.post('/start-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    engineManager.isRunning(req.params.id).then(function(isRunning) {
        if (isRunning)
            return engineManager.killUser(req.params.id);
    }).then(function() {
        return engineManager.startUser(req.params.id);
    }).then(function() {
        res.redirect(303, '/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/kill-all', user.requireRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    engineManager.stop();
    res.redirect(303, '/admin');
});

router.post('/blow-view-cache', user.requireRole(user.Role.ADMIN), function(req, res) {
    jade.cache = {};
    res.redirect(303, '/admin');
});

router.post('/delete-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    if (req.user.id == req.params.id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot delete yourself") });
        return;
    }

    db.withTransaction(function(dbClient) {
        return EngineManager.get().deleteUser(req.params.id).then(function() {
            return model.delete(dbClient, req.params.id);
        });
    }).then(function() {
        res.redirect(303, '/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/promote-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    var needsRestart = false;

    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(user) {
            if (user.developer_status >= 3)
                return;

            if (user.developer_status == 0) {
                needsRestart = true;
                return organization.create(dbClient, { name: '', developer_key: makeRandom() }).then(function(org) {
                    return model.update(dbClient, user.id, { developer_status: 1,
                                                             developer_org: org.id });
                });
            } else {
                return model.update(dbClient, user.id, { developer_status: user.developer_status + 1 });
            }
        });
    }).then(function() {
        if (needsRestart)
            EngineManager.get().restartUser(req.params.id);
        res.redirect(303, '/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/demote-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    if (req.user.id == req.params.id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot demote yourself") });
        return;
    }

    var needsRestart = false;
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(user) {
            if (user.developer_status <= 0)
                return;

            if (user.developer_status == 1) {
                needsRestart = true;
                return model.update(dbClient, user.id, { developer_status: 0, developer_org: null });
            } else {
                return model.update(dbClient, user.id, { developer_status: user.developer_status - 1 });
            }
        });
    }).then(function() {
        if (needsRestart)
            EngineManager.get().restartUser(req.params.id);
        res.redirect(303, '/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.get('/assistant-setup', user.redirectRole(user.Role.ADMIN), function(req, res) {
    if (platform.getSharedPreferences().get('assistant')) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Assistant is already setup") });
        return;
    }

    OmletOAuth.phase1(req, res).done();
});

router.get('/assistant-setup/callback', user.requireRole(user.Role.ADMIN), function(req, res) {
    OmletOAuth.phase2(req, res).then(function() {
        res.redirect(303, '/admin');
    }).done();
});

module.exports = router;
