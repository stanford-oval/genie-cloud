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
"use strict";

const express = require('express');
const passport = require('passport');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

const user = require('../util/user');
const userModel = require('../model/user');
const db = require('../util/db');
const EngineManager = require('../almond/enginemanagerclient');
const iv = require('../util/input_validation');
const { NotFoundError, BadRequestError } = require('../util/errors');
const errorHandling = require('../util/error_handling');
const oauth2server = require('../util/oauth2');
const { makeRandom } = require('../util/random');

const Config = require('../config');

const CloudSync = require('./cloud-sync');
const MyConversation = require('./my_conversation');

var router = express.Router();

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

async function handleSMSMessage(req, engine, message, phone) {
    const conversationId = 'sms' + phone;
    let msg;
    if (message.startsWith('\\t'))
        msg = { type: 'tt', code: message.substring(2).trim(), from: 'phone:'+phone };
    else
        msg = { type: 'command', text: message, from: 'phone:'+phone };
    const result = await engine.converse(msg, conversationId);
    let reply = result.messages.filter((msg) => ['text', 'picture', 'rdl', 'audio', 'video'].includes(msg.type)).map((msg) => {
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
    return reply;
}

router.post('/sms', (req, res, next) => {
    Promise.resolve().then(async () => {
        let phone = req.body.From;
        let message = req.body.Body;

        const anon = await user.getAnonymousUser(req.locale);
        const engine = await EngineManager.get().getEngine(anon.id);

        let reply;
        if (message.toLowerCase() === 'stop' || message.toLowerCase() === 'stop.') {
            await engine.deleteAllApps('twilio', { to: phone });
            reply = req._("Okay, I will stop sending you notifications.");
        } else {
            const conversationId = 'sms' + phone;
            const existing = await engine.hasConversation(conversationId);
            if (!existing) {
                // start the conversation and pass showWelcome true which will set the state
                // correctly, but discard the reply, which we override here
                await engine.getOrOpenConversation(conversationId, undefined, { showWelcome: true, anonymous: true });

                // if we're given a zip code, pass it down to genie
                if (/^\s*[0-9]{5}\s*$/.test(message)) {
                    reply = req._("Hello! This is COVID Genie from Stanford University. I’m here to help you find a covid vaccine appointment near you.");
                    reply += ' ';
                    reply += await handleSMSMessage(req, engine, message, phone);
                } else {
                    // eat the message and reply with some intro text
                    reply = req._("Hello! This is COVID Genie from Stanford University. I’m here to help you find a covid vaccine appointment near you. What is your zipcode?");
                }
            } else {
                reply = await handleSMSMessage(req, engine, message, phone);
            }
        }
        
        const twiml = new MessagingResponse();
        twiml.message(reply);
        res.type('text/xml');
        res.end(twiml.toString());
    }).catch(next);    
});

router.post('/oauth2/token',
    passport.authenticate(['oauth2-client-basic', 'oauth2-client-password'], { session: false }),
    oauth2server.token(), oauth2server.errorHandler());

router.get('/notifications/unsubscribe/:email', (req, res, next) => {
    Promise.resolve().then(async () => {
        const email = new Buffer(req.params.email, 'base64').toString();

        const anon = await user.getAnonymousUser(req.locale);
        const anonEngine = await EngineManager.get().getEngine(anon.id);
        await anonEngine.deleteAllApps('email', { to: email });

        const loggedIn = await db.withClient((dbClient) => {
            const users = userModel.getByEmail(dbClient, email);
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
        id: req.user.cloud_id,
        username: req.user.username,
        full_name: req.user.human_name,
        email: req.user.email,
        email_verified: req.user.email_verified,
        locale: req.user.locale,
        timezone: req.user.timezone,
        model_tag: req.user.model_tag
    });
});

router.post('/converse', user.requireScope('user-exec-command'), (req, res, next) => {
    let command = req.body.command;
    if (!command) {
        next(new BadRequestError('Missing command'));
        return;
    }

    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user.id);
        const result = await engine.converse(command, req.body.conversationId ? String(req.body.conversationId) : 'stateless-' + makeRandom(4));
        res.json(result);
    }).catch(next);
});

router.get('/devices/list', user.requireScope('user-read'), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user.id);
        const result = await engine.getDeviceInfos();
        // sort by name to provide a deterministic result
        result.sort((a, b) => a.name.localeCompare(b.name));
        res.json(result);
    }).catch(next);
});

router.post('/devices/create', user.requireScope('user-exec-command'), iv.validatePOST({ kind: 'string' }, { accept: 'json', json: true }), (req, res, next) => {
    for (let key in req.body) {
        if (['string', 'number', 'boolean'].indexOf(typeof req.body[key]) < 0) {
            iv.failKey(req, res, key, { json: true });
            return;
        }
    }

    EngineManager.get().getEngine(req.user.id).then(async (engine) => {
        res.json(await engine.createDeviceAndReturnInfo(req.body));
    }).catch(next);
});

router.post('/apps/create', user.requireScope('user-exec-command'),
    iv.validatePOST({ code: 'string' }, { accept: 'json', json: true }), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user.id);
        const result = await engine.createAppAndReturnResults(req.body.code, req.body);
        if (result.icon)
            result.icon = Config.CDN_HOST + '/icons/' + result.icon + '.png';
        if (result.error)
            res.status(400);
        res.json(result);
    }).catch(next);
});

router.get('/apps/list', user.requireScope('user-read'), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user.id);
        const apps = await engine.getAppInfos();
        for (let app of apps) {
            if (app.icon)
                app.icon = Config.CDN_HOST + '/icons/' + app.icon + '.png';
        }
        res.json(apps);
    }).catch(next);
});

router.get('/apps/get/:appId', user.requireScope('user-read'), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user.id);
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
        const engine = await EngineManager.get().getEngine(req.user.id);
        const removed = await engine.deleteApp(req.params.appId);
        if (!removed)
            throw new NotFoundError();
        res.json({status:'ok'});
    }).catch(next);
});

router.ws('/sync', user.requireScope('user-sync'), (ws, req) => {
    CloudSync.handle(ws).setUser(req.user.id);
});

// if nothing handled the route, return a 404
router.use('/', (req, res) => {
    res.status(404).json({ error: 'Invalid endpoint' });
});

// if something failed, return a 500 in json form, or the appropriate status code
router.use(errorHandling.json);

module.exports = router;
