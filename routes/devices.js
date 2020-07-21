// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');

const user = require('../util/user');
const EngineManager = require('../almond/enginemanagerclient');
const iv = require('../util/input_validation');

var router = express.Router();

router.use(user.requireLogIn);

router.get('/create', (req, res, next) => {
    res.render('devices_create', { page_title: req._("Thingpedia - Configure device"),
                                   csrfToken: req.csrfToken(),
                                   developerKey: req.user.developer_key,
                                   ownTier: 'cloud',
                                 });
});

router.post('/create', iv.validatePOST({ kind: 'string' }), (req, res, next) => {
    delete req.body['_csrf'];
    for (let key in req.body) {
        if (typeof req.body[key] !== 'string') {
            iv.failKey(req, res, key);
            return;
        }
    }
    
    EngineManager.get().getEngine(req.user.id).then((engine) => {
        return engine.createDeviceAndReturnInfo(req.body);
    }).then(() => {
        if (req.session['device-redirect-to']) {
            res.redirect(303, req.session['device-redirect-to']);
            delete req.session['device-redirect-to'];
        } else {
            res.redirect(303, '/me');
        }
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).catch(next);
});

router.post('/delete', iv.validatePOST({ id: 'string' }), (req, res, next) => {
    EngineManager.get().getEngine(req.user.id).then(async (engine) => {
        const id = req.body.id;
        const removed = await engine.deleteDevice(id);
        if (!removed) {
            res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Not found.") });
        } else if (req.session['device-redirect-to']) {
            res.redirect(303, req.session['device-redirect-to']);
            delete req.session['device-redirect-to'];
        } else {
            res.redirect(303, '/me');
        }
    }).catch(next);
});

// special case google because we have login with google
/*router.get('/oauth2/com.google', user.requireLogIn, function(req, res, next) {
    req.session.redirect_to = '/me';
    next();
}, passport.authorize('google', {
    scope: user.GOOGLE_SCOPES,
    failureRedirect: '/me',
    successRedirect: '/me'
}));*/

router.get('/oauth2/:kind', (req, res, next) => {
    const kind = req.params.kind;

    EngineManager.get().getEngine(req.user.id).then(async (engine) => {
        const result = await engine.startOAuth(kind);
        if (result !== null) {
            const redirect = result[0];
            const session = result[1];
            for (var key in session)
                req.session[key] = session[key];
            res.redirect(303, redirect);
        } else {
            res.redirect(303, '/me');
        }
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).catch(next);
});

module.exports = router;
