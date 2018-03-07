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
const crypto = require('crypto');
const passport = require('passport');

const Config = require('../config');

const db = require('../util/db');
const user = require('../util/user');
const userModel = require('../model/user');
const EngineManager = require('../almond/enginemanagerclient');

const ThingTalk = require('thingtalk');
const AppGrammar = ThingTalk.Grammar;

function makeRandom(bytes) {
    return crypto.randomBytes(bytes).toString('hex');
}

var router = express.Router();

function getAllApps(req, engine) {
    return engine.apps.getAllApps().then(function(apps) {
        return Q.all(apps.map(function(a) {
            return Q.all([a.uniqueId, a.description, a.error])
                .spread(function(uniqueId, description, error) {
                    var app = { uniqueId: uniqueId, description: description || req._("Some app"),
                                error: error };
                    return app;
                });
        }));
    })
}

function getAllDevices(req, engine) {
    return engine.devices.getAllDevices().then(function(devices) {
        return Q.all(devices.map(function(d) {
            return Q.all([d.uniqueId, d.name, d.description, d.kind, d.ownerTier,
                          d.checkAvailable(),
                          d.isTransient,
                          d.hasKind('online-account'),
                          d.hasKind('data-source'),
                          d.hasKind('thingengine-system')])
                .spread(function(uniqueId, name, description, kind,
                                 ownerTier,
                                 available,
                                 isTransient,
                                 isOnlineAccount,
                                 isDataSource,
                                 isThingEngine) {
                    return { uniqueId: uniqueId, name: name || req._("Unknown device"),
                             description: description || req._("Description not available"),
                             kind: kind,
                             ownerTier: ownerTier,
                             available: available,
                             isTransient: isTransient,
                             isOnlineAccount: isOnlineAccount,
                             isDataSource: isDataSource,
                             isPhysical: !isOnlineAccount && !isDataSource,
                             isThingEngine: isThingEngine };
                });
        }));
    }).then(function(devinfo) {
        return devinfo.filter(function(d) {
            return !d.isThingEngine;
        });
    });
}

router.get('/', user.redirectLogIn, function(req, res) {
    EngineManager.get().isRunning(req.user.id).then((isRunning) => {
        if (!isRunning)
            return null;
        else
            return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        if (engine)
            return Q.all([true, getAllApps(req, engine), getAllDevices(req, engine)]);
        else
            return [false, [],[]];
    }).spread(function(isRunning, appinfo, devinfo) {
        devinfo.sort((d1, d2) => {
            if (d1.name < d2.name)
                return -1;
            else if (d1.name > d2.name)
                return 1;
            else
                return 0;
        });

        res.render('my_stuff', { page_title: req._("Thingpedia - My Almond"),
                                 messages: req.flash('app-message'),
                                 csrfToken: req.csrfToken(),
                                 isRunning: isRunning,
                                 apps: appinfo,
                                 devices: devinfo,
                                 S3_CLOUDFRONT_HOST: Config.S3_CLOUDFRONT_HOST
                                });
    }).catch(function(e) {
        console.log(e.stack);
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/apps/delete', user.requireLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        var id = req.body.id;
        return Q.all([engine, engine.apps.getApp(id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Not found.") });
            return;
        }

        return engine.apps.removeApp(app);
    }).then(function() {
        req.flash('app-message', "Application successfully deleted");
        res.redirect(303, '/me');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.get('/conversation', user.redirectLogIn, function(req, res, next) {
    res.render('my_conversation', { page_title: req._("Thingpedia - Web Almond") });
});

module.exports = router;
