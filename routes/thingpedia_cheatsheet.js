// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');

const db = require('../util/db');
const device = require('../model/device');
const user = require('../model/user');
const organization = require('../model/organization');

const model = require('../model/schema');
const exampleModel = require('../model/example');
const deviceModel = require('../model/device');
const tokenize = require('../util/tokenize');

const Config = require('../config');

var router = express.Router();

function findInvocation(parsed, id) {
    if (parsed.action)
        return parsed.action;
    if (parsed.query)
        return parsed.query;
    if (parsed.trigger)
        return parsed.trigger;
    console.log(id + ' not action query or trigger');
}

function getMeta(invocation) {
    var match = /^tt:([^\.]+)\.(.+)$/.exec(invocation.name.id);
    if (match === null)
        throw new TypeError('Channel name not in proper format');
    var kind = match[1];
    var channelName = match[2];
    return [kind, channelName];
}

router.get('/', function(req, res) {
    // FIXME this is a very expensive page to generate, we should
    // cache somehow

    db.withClient(function(dbClient) {
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
                if (dupes.has(ex.target_json))
                    return;
                dupes.add(ex.target_json);
                var parsed = JSON.parse(ex.target_json);
                var invocation = findInvocation(parsed);
                var [kind, channelName] = getMeta(invocation);

                if (kind in kindMap)
                    kind = kindMap[kind];
                if (!(kind in deviceMap)) {
                    // ignore what we don't recognize
                    //console.log('Unrecognized kind ' + kind);
                } else {
                    var tokens = tokenize.tokenize(ex.utterance);

                    var sentence = tokens.map((t) => t.startsWith('$') ? '____' : t).join(' ')
                        .replace(/ \' /g, "'");
                    if (parsed.trigger)
                        deviceMap[kind].triggers.push(sentence);
                    if (parsed.query)
                        deviceMap[kind].queries.push(sentence);
                    if (parsed.action)
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
