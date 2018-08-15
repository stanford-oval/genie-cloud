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
const router = express.Router();

const db = require('../util/db');
const EngineManager = require('../almond/enginemanagerclient');

const Config = require('../config');

router.get('/', (req, res, next) => {
    return Promise.resolve().then(() => {
        return req.user ? EngineManager.get().isRunning(req.user.id) : false;
    }).then((isRunning) => {
        res.render('almond', {
            page_title: req._("Almond - The Open Virtual Assistant"),
            isRunning: isRunning,
            research_page: true
        });
    });
});

router.get('/get-almond', (req, res, next) => {
    res.render('try_almond', {
        page_title: req._("Getting Almond"),
    });
});

if (Config.WITH_THINGPEDIA === 'embedded') {
    router.get('/thingpedia', (req, res, next) => {
        db.withClient((dbClient) => {
            return Promise.all([
                db.selectOne(dbClient, `select count(*) as device_count from device_class where approved_version is not null`),
                db.selectOne(dbClient, `select count(*) as function_count from device_schema, device_schema_channels where schema_id = id and version = approved_version`),
            ]);
        }).then(([{device_count},{function_count}]) => {
            res.render('thingpedia_portal', { page_title: req._("Thingpedia - The Open API Collection"),
                                              csrfToken: req.csrfToken(), device_count, function_count,
                                              research_page: req.get('Referrer') === Config.SERVER_ORIGIN + '/' });
        }).catch(next);
    });

    router.get('/thingpedia/training', (req, res, next) => {
        res.redirect(301, '/thingpedia/developers#sentence-to-code-block');
    });
}

router.get('/about', (req, res, next) => {
    res.redirect(301, '/');
});

router.get('/about/toc', (req, res, next) => {
    res.redirect(301, '/about/tos');
});

router.get('/about/tos', (req, res, next) => {
    res.render('toc', {
        page_title: req._("Terms of Service for Almond & Thingpedia")
    });
});

router.get('/about/privacy', (req, res, next) => {
    res.render('about_privacy', {
        page_title: req._("Almond Privacy Policy")
    });
});

module.exports = router;
