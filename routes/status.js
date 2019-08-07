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
const child_process = require('child_process');

const user = require('../util/user');
const iv = require('../util/input_validation');

const EngineManager = require('../almond/enginemanagerclient');
const userToShardId = require('../almond/shard');

const router = express.Router();
router.use(user.requireLogIn);

function readLogs(userId, startCursor) {
    var args = ['-f', '-o', 'json-sse'];
    if (startCursor) {
        args.push('--after-cursor');
        args.push(startCursor);
    } else {
        args.push('-n');
        args.push('1000');
    }

    const unit = `thingengine-cloud@${userToShardId(userId)}.service`;
    args.push('-u');
    args.push(unit);
    args.push('SYSLOG_IDENTIFIER=thingengine-child-' + userId);

    var child = child_process.spawn('/bin/journalctl', args,
                                    { stdio: ['ignore', 'pipe', 'ignore'] });
    return child;
}

function getCachedModules(userId) {
    return EngineManager.get().getEngine(userId).then((engine) => {
        return engine.devices.factory;
    }).then((devFactory) => {
        return devFactory.getCachedDeviceClasses();
    }).catch((e) => {
        console.log('Failed to retrieve cached modules: ' + e.message);
        return [];
    });
}

router.get('/', (req, res, next) => {
    getCachedModules(req.user.id).then((modules) => {
        return EngineManager.get().isRunning(req.user.id).then((isRunning) => {
            res.render('status', { page_title: req._("Thingpedia - Status"),
                                   csrfToken: req.csrfToken(),
                                   modules: modules,
                                   isRunning: isRunning });
        });
    }).catch(next);
});

router.get('/logs', user.requireDeveloper(), iv.validateGET({ startCursor: '?string' }), (req, res) => {
    var child = readLogs(req.user.id, req.query.startCursor);
    var stdout = child.stdout;
    res.set('Content-Type', 'text/event-stream');
    stdout.pipe(res, { end: false });
    res.on('close', () => {
        child.kill('SIGINT');
        stdout.destroy();
    });
    res.on('error', () => {
        child.kill('SIGINT');
        stdout.destroy();
    });
});

router.post('/kill', (req, res) => {
    var engineManager = EngineManager.get();

    engineManager.killUser(req.user.id);
    res.redirect(303, '/me/status');
});

router.post('/start', (req, res, next) => {
    var engineManager = EngineManager.get();

    engineManager.isRunning(req.user.id).then((isRunning) => {
        if (isRunning)
            return engineManager.killUser(req.user.id);
        else
            return Promise.resolve();
    }).then(() => {
        return engineManager.startUser(req.user.id);
    }).then(() => {
        res.redirect(303, '/me/status');
    }).catch(next);
});

router.post('/recovery/clear-cache', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engineManager = EngineManager.get();

        if (await engineManager.isRunning(req.user.id)) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Your engine is running, kill it before attempting recovery") });
            return;
        }

        await engineManager.clearCache(req.user.id);
        res.redirect(303, '/me/status');
    }).catch(next);
});

router.post('/recovery/clear-data', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engineManager = EngineManager.get();

        if (await engineManager.isRunning(req.user.id)) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Your engine is running, kill it before attempting recovery") });
            return;
        }

        await engineManager.deleteUser(req.user.id);
        res.redirect(303, '/me/status');
    }).catch(next);
});


router.post('/update-module/:kind', (req, res, next) => {
    return EngineManager.get().getEngine(req.user.id).then((engine) => {
        return engine.devices.updateDevicesOfKind(req.params.kind);
    }).then(() => {
        res.redirect(303, '/me/status');
    }).catch(next);
});

module.exports = router; 
