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

module.exports = router;