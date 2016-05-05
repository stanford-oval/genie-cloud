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

function makeRandom() {
    return crypto.randomBytes(32).toString('hex');
}

const EngineManager = require('../lib/enginemanager');
const AssistantDispatcher = require('../assistant/dispatcher');

var router = express.Router();

router.get('/', user.redirectRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    db.withClient(function(dbClient) {
        return model.getAll(dbClient);
    }).then(function(users) {
        users.forEach(function(u) {
            u.isRunning = engineManager.isRunning(u.id);
            u.engineId = u.isRunning ? engineManager.getProcessId(u.id) : null;
        });

        res.render('admin_user_list', { page_title: "ThingPedia - Administration",
                                        csrfToken: req.csrfToken(),
                                        assistantAvailable: AssistantDispatcher.get().isAvailable,
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

    if (engineManager.isRunning(req.params.id))
        engineManager.killUser(req.params.id);

    db.withClient(function(dbClient) {
        return model.get(dbClient, req.params.id);
    }).then(function(user) {
        return engineManager.startUser(user);
    }).then(function() {
        res.redirect(303, '/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: "ThingPedia - Error",
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
        res.render('error', { page_title: "ThingPedia - Error",
                              message: "You cannot delete yourself" });
        return;
    }

    db.withTransaction(function(dbClient) {
        return EngineManager.get().deleteUser(req.params.id).then(function() {
            return model.delete(dbClient, req.params.id);
        });
    }).then(function() {
        res.redirect(303, '/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: "ThingPedia - Error",
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
        res.status(500).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/demote-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    if (req.user.id == req.params.id) {
        res.render('error', { page_title: "ThingPedia - Error",
                              message: "You cannot demote yourself" });
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
        res.status(500).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/message-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    Q.try(function() {
        return db.withClient(function(dbClient) {
            return model.get(dbClient, req.params.id);
        }).then(function(user) {
            if (user.omlet_id === null)
                throw new Error('User has no Omlet Account');
            return AssistantDispatcher.get().getOrCreateFeedForUser(user.omlet_id);
        }).then(function(feed) {
            return feed.open().then(function() {
                return feed.sendText('Administrative message from ' + req.user.username + ': ' + req.body.body);
            }).finally(function() {
                return feed.close();
            });
        });
    }).then(function() {
        res.redirect(303, '/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/message-broadcast', user.requireRole(user.Role.ADMIN), function(req, res) {
    Q.try(function() {
        var msg = 'Broadcast message from ' + req.user.username + ': ' + req.body.body;
        return Q.all(AssistantDispatcher.get().getAllFeeds().map(function(feed) {
            return feed.send(msg);
        }));
    }).then(function() {
        res.redirect('/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.get('/assistant-setup', user.redirectRole(user.Role.ADMIN), function(req, res) {
    if (platform.getSharedPreferences().get('assistant')) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: "Assistant is already setup" });
        return;
    }

    AssistantDispatcher.runOAuth2Phase1(req, res).done();
});

router.get('/assistant-setup/callback', user.requireRole(user.Role.ADMIN), function(req, res) {
    AssistantDispatcher.runOAuth2Phase2(req, res).then(function() {
        res.redirect(303, '/admin');
    }).done();
});

module.exports = router;
