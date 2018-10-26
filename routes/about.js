// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// See COPYING for details
"use strict";

// All pages that are "website" (marketing, research, projects, team, Terms of Service, about...)
// go here
// Pages can be enabled or disabled from the configuration

const express = require('express');

const Config = require('../config');
const db = require('../util/db');
const deviceModel = require('../model/device');

let router = express.Router();

router.get('/', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const devices = await deviceModel.getAllApproved(dbClient, null);
        let filtered_devices = devices.filter((d) => {
            let kind = d.primary_kind;
            if (kind.endsWith('bluetooth.generic') || kind.endsWith('phone') || kind.endsWith('matrix'))
                return true;
            return !kind.startsWith('@org.thingpedia.builtin');
        });
        res.render(Config.ABOUT_OVERRIDE['index'] || 'about_index', {
            page_title: req._('Almond'),
            csrfToken: req.csrfToken(),
            devices: filtered_devices
        });
    }).catch(next);
});
router.get('/about', (req, res) => {
    res.redirect(301, '/');
});

for (let page of Config.EXTRA_ABOUT_PAGES) {
    router.get('/about/' + page.url, (req, res, next) => {
        res.render(page.view, {
            page_title: req._(page.title)
        });
    });
}

// terms of service is always enabled
router.get('/about/tos', (req, res, next) => {
    res.render(Config.ABOUT_OVERRIDE['tos'] || 'about_tos', {
        page_title: req._("Terms of Service for Almond & Thingpedia")
    });
});

// old mispelling (mix of Terms & Condition and Terms of Service)
// that made it in some OAuth authorization pages so we can't get rid of
router.get('/about/toc', (req, res, next) => {
    res.redirect(301, '/about/tos');
});

// privacy policy is always enabled
router.get('/about/privacy', (req, res, next) => {
    res.render(Config.ABOUT_OVERRIDE['privacy'] || 'about_privacy', {
        page_title: req._("Almond Privacy Policy")
    });
});

module.exports = router;
