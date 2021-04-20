// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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
import passport from 'passport';
import { twiml } from 'twilio';

import * as db from '../util/db';
import * as user from '../util/user';
import * as userModel from '../model/user';
import EngineManager from '../almond/enginemanagerclient';
import * as iv from '../util/input_validation';
import { NotFoundError, BadRequestError } from '../util/errors';
import * as errorHandling from '../util/error_handling';
import oauth2server from '../util/oauth2';
import { makeRandom } from '../util/random';

import * as Config from '../config';

import * as CloudSync from './cloud-sync';
import * as MyConversation from './my_conversation';

const router = express.Router();

router.options('/[^]{0,}', (req, res, next) => {
    res.set('Access-Control-Max-Age', '86400');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Authorization, Accept, Content-Type');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Vary', 'Origin');
    res.send('');
});

router.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Vary', 'Origin');
    next();
});

router.post('/sms', (req, res, next) => {
    Promise.resolve().then(async () => {
        const phone = req.body.From;
        const message = req.body.Body;

        const anon = await user.getAnonymousUser();
        const engine = await EngineManager.get().getEngine(anon.id);

        let reply;
        if (message.toLowerCase() === 'stop' || message.toLowerCase() === 'stop.') {
            await engine.deleteAllApps('twilio', { to: phone });
            reply = req._("Okay, I will stop sending you notifications.");
        } else {
            const conversationId = 'sms' + phone;
            const result = await engine.converse({ type: 'command', text: message, from: 'phone:'+phone }, conversationId);
            reply = result.messages.filter((msg) => ['text', 'picture', 'rdl', 'audio', 'video'].includes(msg.type)).map((msg) => {
                if (msg.type === 'text')
                    return msg.text;
                if (msg.type === 'picture')
                    return msg.alt || req._("Picture: %s").format(msg.url);
                if (msg.type === 'audio')
                    return msg.alt || req._("Audio: %s").format(msg.url);
                if (msg.type === 'video')
                    return msg.alt || req._("Video: %s").format(msg.url);
                if (msg.type === 'rdl')
                    return msg.rdl.displayTitle + ' ' + msg.rdl.webCallback;
                return '';
            }).join('\n');
            if (result.askSpecial === 'yesno')
                reply += req._(" [yes/no]");
        }

        const twres = new twiml.MessagingResponse();
        twres.message(reply);
        res.type('text/xml');
        res.end(twres.toString());
    }).catch(next);
});

router.post('/oauth2/token',
    passport.authenticate(['oauth2-client-basic', 'oauth2-client-password'], { session: false }),
    oauth2server.token(), oauth2server.errorHandler());

router.get('/notifications/unsubscribe/:email', (req, res, next) => {
    Promise.resolve().then(async () => {
        const email = new Buffer(req.params.email, 'base64').toString();

        const anon = await user.getAnonymousUser();
        const anonEngine = await EngineManager.get().getEngine(anon.id);
        await anonEngine.deleteAllApps('email', { to: email });

        const loggedIn = await db.withClient(async (dbClient) => {
            const users = await userModel.getByEmail(dbClient, email);
            if (users.length > 0)
                return users[0];
            else
                return undefined;
        });
        if (loggedIn) {
            const engine = await EngineManager.get().getEngine(loggedIn.id);
            await engine.deleteAllApps();
        }

        res.render('message', {
            page_title: 'Genie',
            message: req._("You have successfully unsubscribed %s from all notifications.").format(email)
        });
    }).catch(next);
});

// /me/api/oauth2/authorize is handled later because it needs session support and also
// it is not OAuth authenticated, so exit this router
router.use('/oauth2/authorize', (req, res, next) => next('router'));

router.ws('/anonymous', MyConversation.anonymous);
router.use(passport.authenticate('bearer', { session: false }));
router.use(user.requireLogIn);
router.ws('/results', MyConversation.results);
router.ws('/conversation', MyConversation.conversation);

router.get('/profile', user.requireScope('profile'), (req, res, next) => {
    res.json({
        id: req.user!.cloud_id,
        username: req.user!.username,
        full_name: req.user!.human_name,
        email: req.user!.email,
        email_verified: req.user!.email_verified,
        locale: req.user!.locale,
        timezone: req.user!.timezone,
        model_tag: req.user!.model_tag
    });
});

router.post('/converse', user.requireScope('user-exec-command'), (req, res, next) => {
    const command = req.body.command;
    if (!command) {
        next(new BadRequestError('Missing command'));
        return;
    }

    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        const result = await engine.converse(command, req.body.conversationId ? String(req.body.conversationId) : 'stateless-' + makeRandom(4));
        res.json(result);
    }).catch(next);
});

router.get('/devices/list', user.requireScope('user-read'), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        const result = await engine.getDeviceInfos();
        // sort by name to provide a deterministic result
        result.sort((a, b) => a.name.localeCompare(b.name));
        res.json(result);
    }).catch(next);
});

router.post('/devices/create', user.requireScope('user-exec-command'), iv.validatePOST({ kind: 'string' }, { accept: 'json', json: true }), (req, res, next) => {
    for (const key in req.body) {
        if (['string', 'number', 'boolean'].indexOf(typeof req.body[key]) < 0) {
            iv.failKey(req, res, key, { json: true });
            return;
        }
    }

    EngineManager.get().getEngine(req.user!.id).then(async (engine) => {
        res.json(await engine.createDeviceAndReturnInfo(req.body));
    }).catch(next);
});

router.post('/apps/create', user.requireScope('user-exec-command'), iv.validatePOST({
    code: 'string',
    name: '?string',
    description: '?string',
    icon: '?string'
}, { accept: 'json', json: true }), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        const result = await engine.createAppAndReturnResults(req.body.code, req.body);
        if (result.icon)
            result.icon = Config.CDN_HOST + '/icons/' + result.icon + '.png';
        if (result.errors && result.errors.length)
            res.status(400);
        res.json(result);
    }).catch(next);
});

router.get('/apps/list', user.requireScope('user-read'), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        const apps = await engine.getAppInfos();
        for (const app of apps) {
            if (app.icon)
                app.icon = Config.CDN_HOST + '/icons/' + app.icon + '.png';
        }
        res.json(apps);
    }).catch(next);
});

router.get('/apps/get/:appId', user.requireScope('user-read'), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        const app = await engine.getAppInfo(req.params.appId, false);
        if (!app)
            throw new NotFoundError();
        if (app.icon)
            app.icon = Config.CDN_HOST + '/icons/' + app.icon + '.png';
        res.json(app);
    }).catch(next);
});

router.post('/apps/delete/:appId', user.requireScope('user-exec-command'), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        const removed = await engine.deleteApp(req.params.appId);
        if (!removed)
            throw new NotFoundError();
        res.json({status:'ok'});
    }).catch(next);
});

router.use('/sync', user.requireScope('user-sync'));
router.ws('/sync', (ws, req) => {
    CloudSync.handle(ws).setUser(req.user!.id);
});

// if nothing handled the route, return a 404
router.use('/', (req, res) => {
    res.status(404).json({ error: 'Invalid endpoint' });
});

// if something failed, return a 500 in json form, or the appropriate status code
router.use(errorHandling.json);

export default router;
