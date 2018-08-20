/* eslint-disable prefer-arrow-callback */
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details
"use strict";
const express = require('express');

const db = require('../util/db');
const commandModel = require('../model/example');
const Config = require('../config');

let router = express.Router();

router.get('/', function(req, res) {
    return res.render('app', { page_title: req._('Almond'), csrfToken: req.csrfToken() });
});

router.get('/commands/add', function(req, res) {
    return res.render('app_new_command', { page_title: req._('Create New Command'), csrfToken: req.csrfToken() });
});

router.get('/commands/suggest', function(req, res) {
    return res.render('app_suggest_command', { page_title: req._('Suggest New Command'), csrfToken: req.csrfToken() });
});

router.post('/commands/suggest', function(req, res) {
    let command = req.body['description'];
    db.withTransaction((dbClient) => {
        return commandModel.suggest(dbClient, command);
    }).then(() => {
        return res.render('app_suggest_command', { page_title: req._('Suggest New Command'), csrfToken: req.csrfToken(), submitted: true });
    });
});

router.post('/upvote/:id', function(req, res) {
    db.withTransaction((client) => {
        return commandModel.upvote(client, req.params.id);
    });
});

router.post('/downvote/:id', function(req, res) {
    db.withTransaction((client) => {
        return commandModel.downvote(client, req.params.id);
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
                csrfToken: req.csrfToken(), device_count, function_count });
        }).catch(next);
    });

    router.get('/thingpedia/training', (req, res, next) => {
        res.redirect(301, '/thingpedia/developers#sentence-to-code-block');
    });
}

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