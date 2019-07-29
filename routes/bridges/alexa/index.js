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

const I18n = require('../../../util/i18n');
const errorHandling = require('../../../util/error_handling');
const userUtils = require('../../../util/user');

const EngineManager = require('../../../almond/enginemanagerclient');

var router = express.Router();

class AlexaDelegate {
    constructor(res) {
        this._buffer = '';
        this._res = res;
        this._done = false;

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
        // FIXME
    }

    sendChoice(idx, what, title, text) {
        // FIXME
    }

    sendButton(title, json) {
        // FIXME
    }

    sendLink(title, url) {
        // FIXME
    }

    sendResult(message, icon) {
        // FIXME
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
router.use(I18n.handler);

function extractThingTalkCode(req) {
    if (req.body.request.type === 'SessionEndedRequest')
        return { program: 'bookkeeping(special(nevermind))' };
    else if (req.body.request.type === 'LaunchRequest')
        return { program: 'bookkeeping(special(wakeup))' };
    else if (req.body.request.type === 'IntentRequest')
        throw new Error('Invalid request type ' + req.body.request.type);

    const intent = req.body.request.intent;

    switch (intent.name) {
    case 'AMAZON.StopIntent':
        return { program: 'bookkeeping(special(nevermind))' };

    case 'ALMOND.org.thingpedia.command':
        return { text: intent.slots.command };

    default:
        // TODO look up the intent in the database
        throw new Error('Invalid intent name ' + intent.name);
    }
}

async function handle(req, res) {
    console.log('body', req.body);

    const user = userUtils.isAuthenticated(req) ? req.user : (await userUtils.getAnonymousUser());
    const assistantUser = { name: user.human_name || user.username };
    const input = extractThingTalkCode(req);
    const delegate = new AlexaDelegate(res);

    const engine = await EngineManager.get().getEngine(user.id);
    const conversation = await engine.assistant.getOrOpenConversation('alexa:' + req.body.session.sessionId,
        assistantUser, delegate, { showWelcome: false, debug: true });

    if (input.program)
        await conversation.handleThingTalk(input.program);
    else
        await conversation.handleCommand(input.text);
    await delegate.flush();
}

router.post('/', (req, res, next) => {
    handle(req, res).catch(next);
});

router.use((req, res) => {
    // if we get here, we have a 404 response
    res.status(404).json({ error: "Invalid endpoint", code: 'ENOENT' });
});
router.use(errorHandling.json);

module.exports = router;
