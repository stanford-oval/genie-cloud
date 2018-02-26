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

const ThingTalk = require('thingtalk');

const db = require('../util/db');

const exampleModel = require('../model/example');
const deviceModel = require('../model/device');

const Config = require('../config');

var router = express.Router();

function findInvocation(parsed, id) {
    if (parsed.type === 'action')
        return parsed.value;
    else if (parsed.type)
        return findInvocation(parsed.value, id);
    if (parsed.isMonitor)
        return findInvocation(parsed.table, id);
    if (parsed.isFilter)
        return findInvocation(parsed.table || parsed.stream, id);
    if (parsed.isEdgeFilter)
        return findInvocation(parsed.stream, id);
    if (parsed.isInvocation)
        return parsed.invocation;
    throw new Error(id + ' not action query or trigger, is ' + parsed);
}

router.get('/', (req, res) => {
    // FIXME this is a very expensive page to generate, we should
    // cache somehow

    db.withClient((dbClient) => {
        var deviceMap = {};

        return deviceModel.getAll(dbClient).then((devices) => {
            devices.forEach((d) => {
                if (!d.approved_version)
                    return;
                deviceMap[d.primary_kind] = {
                    name: d.name,
                    primary_kind: d.primary_kind,
                    id: d.id,
                    triggers: [],
                    queries: [],
                    actions: []
                };
            });
        }).then(() => {
            return exampleModel.getBaseByLanguage(dbClient, 'en');
        }).then((examples) => {
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

            var dupes = new Set;

            examples.forEach((ex) => {
                if (dupes.has(ex.target_code) || !ex.target_code)
                    return;
                dupes.add(ex.target_code);
                var parsed = ThingTalk.Grammar.parse(ex.target_code);
                if (!parsed.declarations.length)
                    return;
                var invocation = findInvocation(parsed.declarations[0], ex.id);
                if (!invocation)
                    return;
                var kind = invocation.selector.kind;

                if (kind in kindMap)
                    kind = kindMap[kind];
                if (!(kind in deviceMap)) {
                    // ignore what we don't recognize
                    //console.log('Unrecognized kind ' + kind);
                } else {
                    var sentence = ex.utterance.replace(/\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/g, '____');
                    if (parsed.declarations[0].type === 'stream')
                        deviceMap[kind].triggers.push(sentence);
                    if (parsed.declarations[0].type === 'table')
                        deviceMap[kind].queries.push(sentence);
                    if (parsed.declarations[0].type === 'action')
                        deviceMap[kind].actions.push(sentence);
                }
            });

            var devices = Object.keys(deviceMap).map((k) => deviceMap[k]);
            res.render('thingpedia_cheatsheet', { page_title: req._("Thingpedia - Supported Operations"),
                                                  S3_CLOUDFRONT_HOST: Config.S3_CLOUDFRONT_HOST,
                                                  csrfToken: req.csrfToken(),
                                                  devices: devices });
        });
    }).done();
});

module.exports = router;
