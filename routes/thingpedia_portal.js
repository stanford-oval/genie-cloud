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

let router = express.Router();

router.get('/', (req, res, next) => {
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

router.get('/training', (req, res, next) => {
    res.redirect(301, '/thingpedia/developers#sentence-to-code-block');
});

module.exports = router;
