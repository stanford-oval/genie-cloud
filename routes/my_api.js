// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const express = require('express');
const passport = require('passport');

const user = require('../util/user');
const EngineManager = require('../almond/enginemanagerclient');
const iv = require('../util/input_validation');
const { NotFoundError, BadRequestError } = require('../util/errors');
const errorHandling = require('../util/error_handling');
const oauth2server = require('../util/oauth2');
const { makeRandom } = require('../util/random');

const Config = require('../config');

const CloudSync = require('./cloud-sync');
const MyConversation = require('./my_conversation');

var router = express.Router();

router.options('/[^]{0,}', (req, res, next) => {
    res.set('Access-Control-Max-Age', '86400');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Authorization, Accept, Content-Type');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Vary', 'Origin');
    res.send('');
});

router.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Vary', 'Origin');
    next();
});

router.post('/oauth2/token',
    passport.authenticate(['oauth2-client-basic', 'oauth2-client-password'], { session: false }),
    oauth2server.token(), oauth2server.errorHandler());

// /me/api/oauth2/authorize is handled later because it needs session support and also
// it is not OAuth authenticated, so exit this router
router.use('/oauth2/authorize', (req, res, next) => next('router'));

router.ws('/anonymous', MyConversation.anonymous);
router.use(passport.authenticate('bearer', { session: false }));
router.use(user.requireLogIn);
router.ws('/results', MyConversation.results);
router.ws('/conversation', MyConversation.conversation);

router.get('/profile', user.requireScope('profile'), (req, res, next) => {
    res.json({
        id: req.user.cloud_id,
        username: req.user.username,
        full_name: req.user.human_name,
        email: req.user.email,
        email_verified: req.user.email_verified,
        locale: req.user.locale,
        timezone: req.user.timezone,
        model_tag: req.user.model_tag
    });
});

router.get('/parse', user.requireScope('user-read'), iv.validateGET({ q: '?string', target_json: '?string' }, { json: true }), (req, res, next) => {
    let query = req.query.q || null;
    let targetJson = req.query.target_json || null;
    if (!query && !targetJson) {
        next(new BadRequestError('Missing query'));
        return;
    }

    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.assistant.parse(query, targetJson);
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

router.post('/converse', user.requireScope('user-exec-command'), (req, res, next) => {
    let command = req.body.command;
    if (!command) {
        next(new BadRequestError('Missing command'));
        return;
    }

    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        const assistantUser = { name: user.human_name || user.username, isOwner: true };
        return engine.assistant.converse(command, assistantUser, req.body.conversationId ? String(req.body.conversationId) : 'stateless-' + makeRandom(4));
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

async function describeDevice(d, req) {
    const [uniqueId, name, description, kind, ownerTier] = await Promise.all([
        d.uniqueId, d.name, d.description, d.kind, d.ownerTier]);

    return {
        uniqueId: uniqueId,
        name: name || req._("Unknown device"),
        description: description || req._("Description not available"),
        kind: kind,
        ownerTier: ownerTier
    };
}

router.get('/devices/list', user.requireScope('user-read'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.devices.getAllDevices().then((devices) => {
            return Promise.all(devices.map((d) => describeDevice(d, req)));
        });
    }).then((result) => {
        // sort by name to provide a deterministic result
        result.sort((a, b) => a.name.localeCompare(b.name));
        res.json(result);
    }).catch(next);
});

router.post('/devices/create', user.requireScope('user-exec-command'), iv.validatePOST({ kind: 'string' }, { accept: 'json', json: true }), (req, res, next) => {
    for (let key in req.body) {
        if (['string', 'number', 'boolean'].indexOf(typeof req.body[key]) < 0) {
            iv.failKey(req, res, key, { json: true });
            return;
        }
    }

    EngineManager.get().getEngine(req.user.id).then(async (engine) => {
        const devices = engine.devices;

        const device = await devices.addSerialized(req.body);
        res.json(await describeDevice(device, req));
    }).catch(next);
});

function describeApp(app) {
    return Promise.all([app.uniqueId, app.description, app.error, app.code, app.icon])
        .then(([uniqueId, description, error, code, icon]) => ({
            uniqueId, description, error: error, code,
            icon: icon ? Config.CDN_HOST + '/icons/' + icon + '.png' : null
        }));
}

router.post('/apps/create', user.requireScope('user-exec-command'),
    iv.validatePOST({ code: 'string' }, { accept: 'json', json: true }), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.assistant.createApp(req.body);
    }).then((result) => {
        if (result.error)
            res.status(400);
        res.json(result);
    }).catch(next);
});

router.get('/apps/list', user.requireScope('user-read'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.apps.getAllApps().then((apps) => {
            return Promise.all(apps.map((a) => describeApp(a)));
        });
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

router.get('/apps/get/:appId', user.requireScope('user-read'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.apps.getApp(req.params.appId).then((app) => {
            if (!app)
                throw new NotFoundError();
            return describeApp(app);
        });
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

router.post('/apps/delete/:appId', user.requireScope('user-exec-command'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.apps.getApp(req.params.appId).then((app) => {
            if (!app)
                throw new NotFoundError();
            return engine.apps.removeApp(app).then(() => ({status:'ok'}));
        });
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

router.ws('/sync', user.requireScope('user-sync'), (ws, req) => {
    CloudSync.handle(ws, req.user.id);
});

// if nothing handled the route, return a 404
router.use('/', (req, res) => {
    res.status(404).json({ error: 'Invalid endpoint' });
});

// if something failed, return a 500 in json form, or the appropriate status code
router.use(errorHandling.json);

module.exports = router;
