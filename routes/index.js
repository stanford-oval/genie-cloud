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
const category = require('../model/category');
const device = require('../model/device');

const EngineManager = require('../lib/enginemanager');

router.get('/', function(req, res, next) {
    db.withTransaction(function(dbClient) {
        return Q.all([category.getAll(dbClient),
                      device.getByTag(dbClient, 'featured')]);
    }).spread(function(categories, devices) {
        res.render('index', {
            page_title: 'ThingPedia - knowledge for your magic assistant',
            categories: categories,
            devices: devices,
            isRunning: req.user ? EngineManager.get().isRunning(req.user.id) : false
        });
    }).done();
});

router.get('/about', function(req, res, next) {
    res.render('about', {
        page_title: 'About ThingPedia'
    });
});

router.get('/about/toc', function(req, res, next) {
    res.render('toc', {
        page_title: 'Terms & Conditions for ThingPedia'
    });
});

module.exports = router;
