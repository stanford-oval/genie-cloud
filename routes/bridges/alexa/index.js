// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const passport = require('passport');

const errorHandling = require('../../../util/error_handling');
const userUtils = require('../../../util/user');

const EngineManager = require('../../../almond/enginemanagerclient');

const { requestToThingTalk } = require('./intent_parser');

var router = express.Router();

class AlexaDelegate {
    constructor(locale, res) {
        this._locale = locale;
        this._buffer = '';
        this._res = res;
        this._done = false;
        this._card = undefined;

        this._askSpecial = null;
    }

    flush() {
        if (this._done)
            return;
        this._done = true;
        this._res.json({
           version: '1.0',
           sessionAttributes: {
           },
           response: {
               outputSpeech: {
                   type: 'PlainText',
                   text: this._buffer // + (this._askSpecial === null ? '. Now what do you want me to do?' : '')
               },
               card: this._card,
               shouldEndSession: this._askSpecial === null,
           }
        });
    }

    send(text, icon) {
        this._buffer += text + '\n';
    }

    sendPicture(url, icon) {
        // FIXME
    }

    sendRDL(rdl, icon) {
        this._buffer += rdl.displayTitle + '\n';
    }

    sendChoice(idx, what, title, text) {
        this._buffer += title + '\n';
    }

    sendButton(title, json) {
        // FIXME
    }

    sendLink(title, url) {
        if (url === '/user/register') {
            this._card = {
                type: 'LinkAccount'
            };
        }
        // FIXME handle other URL types
    }

    sendResult(message, icon) {
        this._buffer += message.toLocaleString(this._locale) + '\n';
    }

    sendAskSpecial(what) {
        this._askSpecial = what;
    }
}
AlexaDelegate.prototype.$rpcMethods = ['send', 'sendPicture', 'sendChoice', 'sendLink', 'sendButton', 'sendAskSpecial', 'sendRDL', 'sendResult'];

function authenticate(req, res, next) {
    if (req.body && req.body.session && req.body.session.user && req.body.session.user.accessToken &&
        !req.headers.authorization)
        req.headers.authorization = 'Bearer ' + req.body.session.user.accessToken;
    if (req.headers.authorization)
        passport.authenticate('bearer', { session: false })(req, res, next);
    else
        next();
}

router.use(authenticate);

async function handle(developerKey, req, res) {
    console.log('body', req.body);

    const user = userUtils.isAuthenticated(req) ? req.user : (await userUtils.getAnonymousUser());
    const assistantUser = { name: user.human_name || user.username };
    const input = await requestToThingTalk(user.developer_key, user.locale, req.body);
    const delegate = new AlexaDelegate(res);

    const engine = await EngineManager.get().getEngine(user.id);
    const conversation = await engine.assistant.getOrOpenConversation('alexa:' + req.body.session.sessionId,
        assistantUser, delegate, { showWelcome: false, debug: true });

    if (input.program)
        await conversation.handleThingTalk(input.program);
    else if (input.text)
        await conversation.handleCommand(input.text);
    else
        await conversation.handleParsedCommand(input);
    await delegate.flush();
}

router.post('/', (req, res, next) => {
    handle(null, req, res).catch(next);
});

router.use((req, res) => {
    // if we get here, we have a 404 response
    res.status(404).json({ error: "Invalid endpoint", code: 'ENOENT' });
});
router.use(errorHandling.json);

module.exports = router;
