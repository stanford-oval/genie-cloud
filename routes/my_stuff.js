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

const Config = require('../config');

const user = require('../util/user');
const EngineManager = require('../almond/enginemanagerclient');
const iv = require('../util/input_validation');

var router = express.Router();
router.use(user.requireLogIn);

async function getInfo(req) {
    const isRunning = await EngineManager.get().isRunning(req.user.id);
    if (!isRunning)
        return [false, [],[]];

    const engine = await EngineManager.get().getEngine(req.user.id);
    let [appinfo, devinfo] = await Promise.all([engine.getAppInfos(), engine.getDeviceInfos()]);
    devinfo = devinfo.filter((d) => d.class !== 'system');
    devinfo.sort((d1, d2) => {
        if (d1.name < d2.name)
            return -1;
        else if (d1.name > d2.name)
            return 1;
        else
            return 0;
    });
    return [isRunning, appinfo, devinfo];
}

router.get('/', (req, res, next) => {
    getInfo(req).then(([isRunning, appinfo, devinfo]) => {
        res.render('my_stuff', { page_title: req._("Thingpedia - My Almond"),
                                 messages: req.flash('app-message'),
                                 csrfToken: req.csrfToken(),
                                 isRunning: isRunning,
                                 apps: appinfo,
                                 devices: devinfo,
                                 CDN_HOST: Config.CDN_HOST
                                });
    }).catch(next);
});

router.post('/', iv.validatePOST({ command: 'string' }), (req, res, next) => {
    getInfo(req).then(([isRunning, appinfo, devinfo]) => {
        res.render('my_stuff', { page_title: req._("Thingpedia - My Almond"),
            messages: req.flash('app-message'),
            csrfToken: req.csrfToken(),
            isRunning: isRunning,
            apps: appinfo,
            devices: devinfo,
            CDN_HOST: Config.CDN_HOST,
            command: req.body.command
        });
    }).catch(next);
});

router.post('/apps/delete', iv.validatePOST({ id: 'string' }), (req, res, next) => {
    EngineManager.get().getEngine(req.user.id).then(async (engine) => {
        const removed = await engine.deleteApp(req.body.id);
        if (!removed) {
            res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Not found.") });
            return;
        }
        req.flash('app-message', "Application successfully deleted");
        res.redirect(303, '/me');
    }).catch(next);
});

router.get('/conversation', (req, res, next) => {
    res.render('my_conversation', { page_title: req._("Thingpedia - Web Almond") });
});

router.post('/conversation', iv.validatePOST({ command: 'string' }), (req, res) => {
    res.render('my_conversation', { page_title: req._("Thingpedia - Web Almond"), command: req.body.command });
});

module.exports = router;
