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
const deviceModel = require('../model/device');

let router = express.Router();

router.get('/', function(req, res) {
    db.withTransaction((client) => {
        return commandModel.getCommands(client).then((commands) => {
            let promises = commands.map((command) => {
                // get device kinds from target_code
                let functions = command.target_code.split(' ').filter((code) => code.startsWith('@'));
                let devices = functions.map((f) => {
                    let device_name = f.split('.');
                    device_name.splice(-1, 1);
                    return device_name.join('.').substr(1);
                });
                // deduplicate
                command.devices = devices.filter((device, pos) => devices.indexOf(device) === pos);

                // get device names
                command.deviceNames = [];
                return command.devices.map((device) => {
                    return deviceModel.getByAnyKind(client, device).then((devices) => {
                        command.deviceNames.push(devices[0].name);
                    });
                });
            });
            return Promise.all([].concat.apply([], promises)).then(() => {
                return res.render('app', { page_title: req._('Almond'), csrfToken: req.csrfToken(), commands: commands });
            });
        });
    }).done();
});

router.get('/commands/add', function(req, res) {
    return res.render('app_new_command', { page_title: req._('Create New Command'), op: 'add', csrfToken: req.csrfToken() });
});

router.get('/commands/suggest', function(req, res) {
    return res.render('app_new_command', { page_title: req._('Suggest New Command'), op: 'suggest', csrfToken: req.csrfToken() });
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