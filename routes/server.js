// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const express = require('express');
const passport = require('passport');

const EngineManager = require('../enginemanager');
const WebhookDispatcher = require('../webhookdispatcher');

var router = express.Router();

router.post('/login', passport.authenticate('local', { session: false }), function(req, res, next) {
    res.json({
        success: true,
        cloudId: req.user.cloud_id,
        authToken: req.user.auth_token
    });
});

router.post('/ui-command', passport.authenticate('bearer', { session: false }), function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        req.body.tier = 'cloud';
        return engine.ui.injectUIEvent(req.body);
    }).then(function() {
        res.json({ result: 'ok' });
    }).catch(function(e) {
        res.json({ error: e.message, code: e.code });
    }).done();
});

router.use('/oauth2', require('./oauth2'));

router.post('/webhook/:cloud_id/:id', function(req, res) {
    WebhookDispatcher.get().dispatch(req, res);
});

router.get('/webhook/:cloud_id/:id', function(req, res) {
    WebhookDispatcher.get().dispatch(req, res);
});

module.exports = router;
