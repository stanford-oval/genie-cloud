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

const Q = require('q');
const express = require('express');
const passport = require('passport');

const EngineManager = require('../almond/enginemanagerclient');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Suggestion} = require('dialogflow-fulfillment');

var router = express.Router();

class GoogleAssistantDelegate {
    constructor() {
        this._buffer = '';
        this._askSpecial = null;
    }

    send(text, icon) {
        this._buffer += text;
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

    sendAskSpecial(what) {
        this._askSpecial = what;
    }
}
GoogleAssistantDelegate.prototype.$rpcMethods = ['send', 'sendPicture', 'sendChoice', 'sendLink', 'sendButton', 'sendAskSpecial', 'sendRDL'];


router.post('/', (req, res, next) => {
    console.log('Dialogflow Request headers: ' + JSON.stringify(req.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(req.body));
    console.log('Dialogflow Request user: ' + req.user);
    if (req.body && req.body.originalDetectIntentRequest.payload.user && req.body.originalDetectIntentRequest.payload.user.accessToken &&
        !req.headers.authorization)
        req.headers.authorization = 'Bearer ' + req.body.originalDetectIntentRequest.payload.user.accessToken;
    if (req.headers.authorization) {
        passport.authenticate('bearer', (err, user, info) => {
            // ignore auth failures and ignore sessions
            if (err) {
                next(err);
                return;
            }

            if (!user) {
                res.status(401).json({error: 'invalid access token'});
                return;
            }
            req.login(user, next);
        })(req, res, next);
    } else {
        res.status(401).json({error: 'no user found'});
    }
}, (req, res) => {
    console.log('Dialogflow Request headers: ' + JSON.stringify(req.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(req.body));
    console.log('Dialogflow Request user: ' + JSON.stringify(req.user));
    const agent = new WebhookClient({request: req, response: res});
    const raw = req.body.queryResult.queryText;
    console.log('Received command: ' + raw);

    const user = req.user;
    const assistantUser = { name: user.human_name || user.username };
    const delegate = new GoogleAssistantDelegate();

    function welcome(agent) {
        agent.add(`welcome!`);
        agent.add(new Suggestion(`play a song`));
        agent.add(new Suggestion(`play taylor swift`));
        agent.add(new Suggestion(`how danceable is this song?`));
    }

    function fallback(agent) {
        return Q.try(() => {
            return EngineManager.get().getEngine(user.id);
        }).then((engine) => {
            return engine.assistant.getOrOpenConversation('alexa:' + req.body.originalDetectIntentRequest.payload.conversation.conversationId,
                assistantUser, delegate, { showWelcome: false, debug: true });
        }).then((conversation) => {
            return conversation.handleCommand(raw);
        }).then(() => {
            console.log('Delegate buffer: ' + delegate._buffer);
            console.log('Delegate askSpecial: ' + delegate._askSpecial);
            if (delegate._buffer)
                agent.add(delegate._buffer);
            else
                agent.add("Consider it done.");
        });
    }

    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    agent.handleRequest(intentMap);
});

module.exports = router;
