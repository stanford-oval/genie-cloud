// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// See COPYING for details
"use strict";

const express = require('express');

const db = require('../util/db');
const commandModel = require('../model/example');

let router = express.Router();

router.get('/add', (req, res) => {
    return res.render('app_new_command', { page_title: req._('Create New Command'), csrfToken: req.csrfToken() });
});

router.post('/suggest', (req, res, next) => {
    let command = req.body['description'];
    db.withTransaction((dbClient) => {
        return commandModel.suggest(dbClient, command);
    }).then(() => {
        return res.redirect(303, '/thingpedia/commands/add');
    }).catch(next);
});

module.exports = router;
