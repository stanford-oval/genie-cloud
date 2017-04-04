// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const router = express.Router();
const user = require('../util/user');
const db = require('../util/db');
const device = require('../model/device');

const EngineManager = require('../lib/enginemanager');

router.get('/', function(req, res, next) {
    db.withTransaction(function(dbClient) {
        return device.getByTag(dbClient, 'featured');
    }).spread(function(devices) {
        res.render('index', {
            page_title: req._("Thingpedia - knowledge for your magic assistant"),
            devices: devices,
            isRunning: req.user ? EngineManager.get().isRunning(req.user.id) : false
        });
    }).done();
});

router.get('/about', function(req, res, next) {
    res.render('about', {
        page_title: req._("About Thingpedia")
    });
});

router.get('/about/toc', function(req, res, next) {
    res.redirect(301, '/about/tos');
});

router.get('/about/tos', function(req, res, next) {
    res.render('toc', {
        page_title: req._("Terms of Service for Almond & Thingpedia")
    });
});

module.exports = router;
