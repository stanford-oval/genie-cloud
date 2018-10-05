// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');

const db = require('../util/db');
const exampleModel = require('../model/example');
const deviceModel = require('../model/device');

const DatasetUtils = require('../util/dataset');
const I18n = require('../util/i18n');
const tokenize = require('../util/tokenize');

const Config = require('../config');

var router = express.Router();

const kindMap = {
    'thermostat': 'com.nest',
    'light-bulb': 'com.hue',
    'security-camera': 'com.nest',
    'car': 'com.tesla',
    'speaker': 'org.thingpedia.bluetooth.speaker.a2dp',
    'scale': 'com.bodytrace.scale',
    'heatpad': 'com.parklonamerica.heatpad',
    'activity-tracker': 'com.jawbone.up',
    'fitness-tracker': 'com.jawbone.up',
    'heartrate-monitor': 'com.jawbone.up',
    'sleep-tracker': 'com.jawbone.up',
    'tumblr-blog': 'com.tumblr'
};

router.get('/', (req, res, next) => {
    const language = req.user ? I18n.localeToLanguage(req.user.locale) : 'en';

    db.withClient(async (dbClient) => {
        const [devices, examples] = await Promise.all([
            deviceModel.getAllApproved(dbClient, null),
            exampleModel.getCheatsheet(dbClient, language)
        ]);

        const deviceMap = new Map;
        devices.forEach((d, i) => {
            d.examples = [];
            deviceMap.set(d.primary_kind, i);
        });

        var dupes = new Set;
        examples.forEach((ex) => {
            if (dupes.has(ex.target_code) || !ex.target_code)
                return;
            dupes.add(ex.target_code);
            let kind = ex.kind;
            if (kind in kindMap)
                kind = kindMap[kind];

            if (!deviceMap.has(kind)) {
                // ignore what we don't recognize
                console.log('Unrecognized kind ' + kind);
            } else {
                devices[deviceMap.get(kind)].examples.push(ex);
            }
        });

        for (let device of devices)
            device.examples = DatasetUtils.sortAndChunkExamples(device.examples);

        res.render('thingpedia_cheatsheet', { page_title: req._("Thingpedia - Supported Operations"),
                                              CDN_HOST: Config.CDN_HOST,
                                              csrfToken: req.csrfToken(),
                                              devices: devices,
                                              clean: tokenize.clean });
    }).catch(next);
});

module.exports = router;
