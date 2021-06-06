// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import express from 'express';
import * as child_process from 'child_process';

import * as user from '../util/user';
import * as iv from '../util/input_validation';

import EngineManager from '../almond/enginemanagerclient';
import userToShardId from '../almond/shard';

const router = express.Router();
router.use(user.requireLogIn);

function readLogs(userId : number, startCursor ?: string) {
    const args = ['-f', '-o', 'json-sse'];
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

    const child = child_process.spawn('/bin/journalctl', args,
                                    { stdio: ['ignore', 'pipe', 'ignore'] });
    return child;
}

function getCachedModules(userId : number) {
    return EngineManager.get().getEngine(userId).then((engine) => {
        return engine.getCachedDeviceClasses();
    }).catch((e) => {
        // ignore errors related to the communication with the engine
        // (which indicate the engine is dead/dying), but propagate
        // all other errors
        if (['ERR_SOCKET_CLOSED', 'EPIPE', 'ECONNRESET', 'EIO', 'E_ENGINE_DEAD', 'E_INVALID_USER'].indexOf(e.code) < 0)
            throw e;

        console.log('Failed to retrieve cached modules: ' + e.message);
        return [];
    });
}

router.get('/', (req, res, next) => {
    getCachedModules(req.user!.id).then((modules) => {
        return EngineManager.get().isRunning(req.user!.id).then((isRunning) => {
            res.render('status', { page_title: req._("Thingpedia - Status"),
                                   csrfToken: req.csrfToken(),
                                   modules: modules,
                                   isRunning: isRunning });
        });
    }).catch(next);
});

router.get('/logs', user.requireDeveloper(user.DeveloperStatus.USER), iv.validateGET({ startCursor: '?string' }), (req, res) => {
    const child = readLogs(req.user!.id, req.query.startCursor);
    const stdout = child.stdout;
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
    const engineManager = EngineManager.get();

    engineManager.killUser(req.user!.id);
    res.redirect(303, '/me/status');
});

router.post('/start', (req, res, next) => {
    const engineManager = EngineManager.get();

    engineManager.isRunning(req.user!.id).then((isRunning) => {
        if (isRunning)
            return engineManager.killUser(req.user!.id);
        else
            return Promise.resolve();
    }).then(() => {
        return engineManager.startUser(req.user!.id);
    }).then(() => {
        res.redirect(303, '/me/status');
    }).catch(next);
});

router.post('/recovery/clear-cache', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engineManager = EngineManager.get();

        if (await engineManager.isRunning(req.user!.id)) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Your engine is running, kill it before attempting recovery") });
            return;
        }

        await engineManager.clearCache(req.user!.id);
        res.redirect(303, '/me/status');
    }).catch(next);
});

router.post('/recovery/clear-data', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engineManager = EngineManager.get();

        if (await engineManager.isRunning(req.user!.id)) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Your engine is running, kill it before attempting recovery") });
            return;
        }

        await engineManager.deleteUser(req.user!.id);
        res.redirect(303, '/me/status');
    }).catch(next);
});


router.post('/update-module/:kind', (req, res, next) => {
    return EngineManager.get().getEngine(req.user!.id).then((engine) => {
        return engine.upgradeDevice(req.params.kind);
    }).then(() => {
        res.redirect(303, '/me/status');
    }).catch(next);
});

export default router;
