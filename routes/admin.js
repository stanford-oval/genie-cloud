// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const jade = require('pug');
const crypto = require('crypto');

const user = require('../util/user');
const model = require('../model/user');
const organization = require('../model/organization');
const snapshot = require('../model/snapshot');
const db = require('../util/db');

const OmletOAuth = require('../omlet/oauth2');

function makeRandom() {
    return crypto.randomBytes(32).toString('hex');
}

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

const USERS_PER_PAGE = 50;

function renderUserList(users) {
    const engineManager = EngineManager.get();

    return Q.all(users.map((u) => {
        if (!engineManager)
            return;
        return engineManager.getProcessId(u.id).then((pid) => {
            if (pid === -1) {
                u.isRunning = false;
                u.engineId = null;
            } else {
                u.isRunning = true;
                u.engineId = pid;
            }
        });
    })).then(() => users);
}

router.get('/', user.redirectRole(user.Role.ADMIN), function(req, res) {
    var page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient(function(dbClient) {
        return model.getAll(dbClient, page * USERS_PER_PAGE, USERS_PER_PAGE + 1);
    }).then(renderUserList).then(function(users) {
        res.render('admin_user_list', { page_title: req._("Thingpedia - Administration"),
                                        csrfToken: req.csrfToken(),
                                        assistantAvailable: platform.getSharedPreferences().get('assistant') !== undefined,
                                        users: users,
                                        page_num: page,
                                        search: '',
                                        USERS_PER_PAGE });
    }).done();
});

router.get('/search', user.redirectRole(user.Role.ADMIN), function(req, res) {
    db.withClient(function(dbClient) {
        if (req.query.q !== '' && !isNaN(req.query.q))
            return Q.all([model.get(dbClient, Number(req.query.q))]);
        else
            return model.getSearch(dbClient, req.query.q);
    }).then(renderUserList).then(function(users) {
        res.render('admin_user_list', { page_title: req._("Thingpedia - Administration"),
                                        csrfToken: req.csrfToken(),
                                        assistantAvailable: platform.getSharedPreferences().get('assistant') !== undefined,
                                        users: users,
                                        page_num: 0,
                                        search: req.query.search,
                                        USERS_PER_PAGE });
    }).done();
});

router.post('/kill-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    engineManager.killUser(parseInt(req.params.id)).then(() => {
        res.redirect(303, '/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/start-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    engineManager.isRunning(parseInt(req.params.id)).then(function(isRunning) {
        if (isRunning)
            return engineManager.killUser(parseInt(req.params.id));
    }).then(function() {
        return engineManager.startUser(parseInt(req.params.id));
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
        return EngineManager.get().deleteUser(parseInt(req.params.id)).then(function() {
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

router.get('/snapshots', user.redirectLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return snapshot.getAll(dbClient, page * 20, 21);
    }).then((rows) => {
        res.render('thingpedia_snapshot_list', { page_title: req._("Thingpedia - List of Snapshots"),
                                                 csrfToken: req.csrfToken(),
                                                 page_num: page,
                                                 snapshots: rows });
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/snapshots/create', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    db.withTransaction((dbClient) => {
        var obj = {
            description: req.body.description || '',
        }
        return snapshot.create(dbClient, obj);
    }).then(() => {
        res.redirect(303, '/admin/snapshots');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;
