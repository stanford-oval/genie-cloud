// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const child_process = require('child_process');
const path = require('path');
const sqlite3 = require('sqlite3');

const user = require('../util/user');
const model = require('../model/user');
const db = require('../util/db');

const EngineManager = require('../lib/enginemanager');

var router = express.Router();

function readLogs(userId, startCursor) {
    var args = ['-f', '-o', 'json-sse'];
    if (startCursor) {
        args.push('--after-cursor');
        args.push(startCursor);
    } else {
        args.push('-n');
        args.push('100');
    }

    var unit;
    if ('THINGENGINE_UNIT_NAME' in process.env) {
        unit = process.env.THINGENGINE_UNIT_NAME;
    } else {
        unit = 'thingengine-cloud';
    }
    if (unit) {
        args.push('-u');
        args.push(unit);
    }

    args.push('SYSLOG_IDENTIFIER=thingengine-child-' + userId);

    var child = child_process.spawn('/usr/bin/journalctl', args,
                                    { stdio: ['ignore', 'pipe', 'ignore'] });
    return child;
}

function getCachedModules(userId) {
    return EngineManager.get().getEngine(userId).then(function(engine) {
        return engine.devices.factory;
    }).then(function(devFactory) {
        return devFactory.getCachedModules();
    }).catch(function(e) {
        console.log('Failed to retrieve cached modules: ' + e.message);
        return [];
    });
}

router.get('/', user.redirectLogIn, function(req, res) {
    getCachedModules(req.user.id).then(function(modules) {
        res.render('status', { page_title: req._("ThingPedia - Status"),
                               csrfToken: req.csrfToken(),
                               modules: modules,
                               isRunning: EngineManager.get().isRunning(req.user.id) });
    }).done();
});

router.get('/logs', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    var child = readLogs(req.user.id, req.query.startCursor);
    var stdout = child.stdout;
    res.set('Content-Type', 'text/event-stream');
    stdout.pipe(res, { end: false });
    res.on('close', function() {
        child.kill('SIGINT');
        stdout.destroy();
    });
    res.on('error', function() {
        child.kill('SIGINT');
        stdout.destroy();
    });
});

router.post('/kill', user.requireLogIn, function(req, res) {
    var engineManager = EngineManager.get();

    engineManager.killUser(req.user.id);
    res.redirect(303, '/me/status');
});

router.post('/start', user.requireLogIn, function(req, res) {
    var engineManager = EngineManager.get();

    if (engineManager.isRunning(req.user.id))
        engineManager.killUser(req.user.id);

    engineManager.startUser(req.user).then(function() {
        res.redirect(303, '/me/status');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

router.post('/recovery/wipe-cache', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    var engineManager = EngineManager.get();

    if (engineManager.isRunning(req.user.id)) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: req._("Your engine is running, kill it before attempting recovery") });
        return;
    }

    var p = path.resolve('./' + req.user.cloud_id + '/cache');
    console.log('Wiping path ' + path);
    Q.nfcall(child_process.execFile, '/usr/bin/rm', ['-rf', p]).then(function() {
        res.redirect(303, '/me/status');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

router.post('/recovery/remove-all-apps', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    var engineManager = EngineManager.get();

    if (engineManager.isRunning(req.user.id)) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: req._("Your engine is running, kill it before attempting recovery") });
        return;
    }

    var p = path.resolve('./' + req.user.cloud_id + '/sqlite.db');

    var db = new sqlite3.Database(p, sqlite3.OPEN_READWRITE, function(err) {
        if (err) {
            res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                              message: err });
        } else {
            Q.ninvoke(db, 'run', 'delete from app').then(function() {
                return Q.ninvoke(db, 'close');
            }).then(function() {
                res.redirect(303, '/me/status');
            }).catch(function(e) {
                res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                                  message: e });
            }).done();
        }
    });
});

router.post('/recovery/remove-all-devices', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    var engineManager = EngineManager.get();

    if (engineManager.isRunning(req.user.id)) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: req._("Your engine is running, kill it before attempting recovery") });
        return;
    }

    var p = path.resolve('./' + req.user.cloud_id + '/sqlite.db');

    var db = new sqlite3.Database(p, sqlite3.OPEN_READWRITE, function(err) {
        if (err) {
            res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                              message: err });
        } else {
            Q.ninvoke(db, 'run', 'delete from device').then(function() {
                return Q.ninvoke(db, 'close');
            }).then(function() {
                res.redirect(303, '/me/status');
            }).catch(function(e) {
                res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                                  message: e });
            }).done();
        }
    });
});

router.post('/update-module/:kind', user.requireLogIn, function(req, res) {
    return EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return engine.devices.updateDevicesOfKind(req.params.kind);
    }).then(function() {
        res.redirect('/me/status');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router; 
