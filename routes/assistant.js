// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');

const db = require('../util/db');
const model = require('../model/user');
const user = require('../util/user');
const EngineManager = require('../enginemanager');
const AssistantDispatcher = require('../assistantdispatcher');

var router = express.Router();

router.get('/', user.redirectLogIn, function(req, res) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return engine.messaging.isAvailable;
    }).then(function(available) {
        res.render('assistant_config', { page_title: "ThingEngine - Sabrina",
                                         isConfigured: req.user.assistant_feed_id !== null,
                                         messagingAvailable: available,
                                         tutorialContinue: req.session['tutorial-continue'] });
    }).catch(function(e) {
        res.status(500).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.get('/omlet', user.redirectLogIn, function(req, res) {
    req.session['device-redirect-to'] = '/assistant';
    res.redirect('/devices/oauth2/omlet');
});

router.get('/enable', user.redirectLogIn, function(req, res) {
    if (req.user.assistant_feed_id !== null) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: "Sabrina is already configured" });
        return;
    }

    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return engine.messaging.getOwnId().then(function(ownId) {
            return engine.messaging.getAccountById(ownId);
        }).then(function(account) {
            return AssistantDispatcher.get().createFeedForEngine(req.user.id, engine, account);
        });
    }).then(function(feedId) {
        return db.withTransaction(function(dbClient) {
            return model.update(dbClient, req.user.id, { assistant_feed_id: feedId });
        });
    }).then(function() {
        res.redirect('/assistant');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.get('/setup', user.redirectRole(user.Role.ADMIN), function(req, res) {
    if (platform.getSharedPreferences().get('assistant')) {
        res.send("Already set up");
        return;
    }

    AssistantDispatcher.runOAuth2Phase1(req, res).done();
});

router.get('/setup/callback', user.requireRole(user.Role.ADMIN), function(req, res) {
    AssistantDispatcher.runOAuth2Phase2(req, res).then(function() {
        res.send("Ok");
    }).done();
});

module.exports = router;
