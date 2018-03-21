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

const user = require('../util/user');
const snapshot = require('../model/snapshot');
const db = require('../util/db');

const router = express.Router();

router.get('/', user.redirectLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return snapshot.getAll(dbClient, page * 20, 21);
    }).then((rows) => {
        res.render('thingpedia_snapshot_list', { page_title: req._("Thingpedia - List of Snapshots"),
                                                 csrfToken: req.csrfToken(),
                                                 page_num: page,
                                                 snapshots: rows });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/create', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    db.withTransaction((dbClient) => {
        var obj = {
            description: req.body.description || '',
        };
        return snapshot.create(dbClient, obj);
    }).then(() => {
        res.redirect(303, '/thingpedia/snapshots');
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;