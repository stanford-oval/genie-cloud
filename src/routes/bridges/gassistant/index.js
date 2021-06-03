// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Swee Kiat Lim <sweekiat@cs.stanford.edu>
"use strict";

const express = require('express');
const passport = require('passport');
const util = require('util');
const jwt = require('jsonwebtoken');

const EngineManager = require('../../../almond/enginemanagerclient');
const { actionssdk, Image, Suggestions, BasicCard, Button, SignIn } = require('actions-on-google');
// Refer to https://developers.google.com/assistant/conversational/responses for full list of response types

const db = require('../../../util/db');
const gAssistantUserUtils = require('../../../util/user');
const gAssistantUserModel = require('../../../model/user');
const secret = require('../../../util/secret_key');

const Config = require('../../../config');

var router = express.Router();

class GoogleAssistantDelegate {
    constructor(locale) {
        this._buffer = [];
        this._locale = locale;
        this._requestSignin = false;
        this._suggestions = [];
    }

    setHypothesis() {}

    setExpected(what) {
        this._askSpecial = what;
    }

    addMessage(msg) {
        switch (msg.type) {
        case 'text':
        case 'result':
            if (typeof this._buffer[this._buffer.length - 1] === 'string')
                // If there is already a text reply immediately before, we merge text replies
                // because Google Assistant limits at most 2 chat bubbles per turn
                this._buffer[this._buffer.length - 1] += '\n' + msg.text;
            else
                this._buffer.push(msg.text);
            break;

        case 'picture':
            if (typeof this._buffer[this._buffer.length - 1] !== 'string')
                // If there is no text reply immediately before, we add the URL
                // because Google Assistant requires a chat bubble to accompany an Image
                this._buffer.push(msg.url);
            this._buffer.push(new Image({
                url: msg.url,
                alt: msg.url,
            }));
            break;

        case 'choice':
            // Output choice options as regular text
            if (typeof this._buffer[this._buffer.length - 1] === 'string')
                // If there is already a text reply immediately before, we merge text replies
                // because Google Assistant limits at most 2 chat bubbles per turn
                this._buffer[this._buffer.length - 1] += '\n' + msg.title;
            else
                this._buffer.push(msg.title);
            break;

        case 'rdl': {
            let card = {
                title: msg.rdl.displayTitle,
                buttons: new Button({
                    title: msg.rdl.displayTitle,
                    url: msg.rdl.webCallback,
                }),
                display: 'CROPPED',
            };
            if (msg.rdl.displayText)
                card.text = msg.rdl.displayText;
            if (msg.rdl.pictureUrl) {
                card.image = new Image({
                    url: msg.rdl.pictureUrl,
                    alt: msg.rdl.pictureUrl
                });
            }
            this._buffer.push(new BasicCard(card));
            break;
        }

        case 'link':
            if (msg.url === '/user/register') {
                this._requestSignin = true;
            } else {
                this._buffer.push(new Button({
                    title: msg.title,
                    url: Config.SERVER_ORIGIN + msg.url,
                }));
            }
            break;

        case 'button':
            // Filter out buttons more than 25 characters long since
            // Google Assistant has a cap of 25 characters for Suggestions
            if (msg.title.length <= 25)
                this._suggestions.push(msg.title.substring(0, 25));
            break;
        }
    }
}
GoogleAssistantDelegate.prototype.$rpcMethods = ['setExpected', 'setHypothesis', 'addMessage'];

function authenticate(req, res, next) {
    console.log(req.body.user);
    if (req.body.user.accessToken) {
        req.headers.authorization = 'Bearer ' + req.body.user.accessToken;
        passport.authenticate('bearer', { session: false })(req, res, next);
    } else {
        next();
    }
}

router.use(authenticate);
router.use(gAssistantUserUtils.requireScope('user-exec-command'));

const app = actionssdk();

async function retrieveUser(accessToken) {
    let anonymous, user;
    if (accessToken) {
        const decoded = await util.promisify(jwt.verify)(accessToken, secret.getJWTSigningKey(), {
            algorithms: ['HS256'],
            audience: 'oauth2',
            clockTolerance: 30,
        });
        user = await db.withClient(async (dbClient) => {
            const rows = await gAssistantUserModel.getByCloudId(dbClient, decoded.sub);
            if (rows.length < 1) {
                anonymous = true;
                return await gAssistantUserUtils.getAnonymousUser();
            }
            anonymous = false;
            return rows[0];
        });
    } else {
        anonymous = true;
        user = await gAssistantUserUtils.getAnonymousUser();
    }
    return [anonymous, user];
}

// Welcome response when user first initiates conversation
app.intent('actions.intent.MAIN', async (conv) => {

    const [anonymous, user] = await retrieveUser(conv.body.user.accessToken);

    const locale = conv.body.user.locale;
    const conversationId = conv.body.conversation.conversationId;
    const delegate = new GoogleAssistantDelegate(locale);

    const engine = await EngineManager.get().getEngine(user.id);
    await engine.getOrOpenConversation('google_assistant:' + conversationId,
        delegate, { anonymous, showWelcome: true, debug: true });

    if (delegate._suggestions.length)
        delegate._buffer.push(new Suggestions(delegate._suggestions));
    delegate._buffer.forEach((reply) => conv.ask(reply));
});

// Immediate response after user authenticates
app.intent('actions.intent.SIGN_IN', (conv, input, signin) => {
    if (signin.status === 'OK')
        conv.ask("Thank you for signing in! What would you like to do next?");
    else
        conv.ask("You were unable to log in. Is there something else you want to do?");
});

// All other responses
app.intent('actions.intent.TEXT', async (conv, input) => {
    // Quick hack so that Almond recognizes bye and goodbye
    // and returns user to Google Assistant
    if (input === 'bye' || input === 'goodbye') {
        await conv.close("See you later!");
        return;
    }
    // TODO - better way for user to initiate sign in
    if (input === 'I want to sign in') {
        // This will reply "<To get your account details>, I need to link your
        // <action> account to Google. Is that okay?"
        // Answering "yes" will generate the log-in link
        await conv.ask(new SignIn("To get your account details"));
        return;
    }

    const [anonymous, user] = await retrieveUser(conv.body.user.accessToken);

    const locale = conv.body.user.locale;
    const conversationId = conv.body.conversation.conversationId;
    const delegate = new GoogleAssistantDelegate(locale);

    const engine = await EngineManager.get().getEngine(user.id);
    const conversation = await engine.assistant.getOrOpenConversation('google_assistant:' + conversationId,
        delegate, { anonymous, showWelcome: false, debug: true });

    if (input.startsWith('\\t'))
        await conversation.handleThingTalk(input.substring(3));
    else
        await conversation.handleCommand(input);

    if (delegate._suggestions.length)
        delegate._buffer.push(new Suggestions(delegate._suggestions));
    if (delegate._buffer.length) {
        delegate._buffer.forEach((reply) => conv.ask(reply));
        // Another way to initiate authentication, initiated by Almond
        if (delegate._requestSignin)
            await conv.ask(new SignIn("To get your account details"));
    } else {
        await conv.close("Consider it done.");
    }
});

router.post('/fulfillment', app);

module.exports = router;
