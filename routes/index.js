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

const EngineManager = require('../almond/enginemanagerclient');

router.get('/', (req, res, next) => {
    return Promise.resolve().then(() => {
        return req.user ? EngineManager.get().isRunning(req.user.id) : false;
    }).then((isRunning) => {
        res.render('almond', {
            page_title: req._("Almond - The Open Virtual Assistant"),
            isRunning: isRunning
        });
    });
});

router.get('/thingpedia', (req, res, next) => {
    res.render('thingpedia_portal', { page_title: req._("Thingpedia - The Open API Collection"),
                                      csrfToken: req.csrfToken() });
});

router.get('/about', (req, res, next) => {
    res.render('about', {
        page_title: req._("About Thingpedia")
    });
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
