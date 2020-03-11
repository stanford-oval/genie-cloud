// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Swee Kiat Lim <sweekiat@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const express = require('express');
const passport = require('passport');

const EngineManager = require('../../../almond/enginemanagerclient');
const { actionssdk, Image, Suggestions, BasicCard, Button, SignIn } = require('actions-on-google');
// Refer to https://developers.google.com/assistant/conversational/responses for full list of response types

const userUtils = require('../../../util/user');

var router = express.Router();

class GoogleAssistantDelegate {
    constructor(locale) {
        this._buffer = [];
        this._locale = locale;
        this._requestSignin = false;
    }

    send(text, icon) {
        if (typeof this._buffer[this._buffer.length - 1] === 'string')
            // If there is already a text reply immediately before, we merge text replies
            // because Google Assistant limits at most 2 chat bubbles per turn
            this._buffer[this._buffer.length - 1] += '\n' + text;
        else
            this._buffer.push(text);
    }

    sendPicture(url, icon) {
        if (typeof this._buffer[this._buffer.length - 1] !== 'string')
            // If there is no text reply immediately before, we add the URL
            // because Google Assistant requires a chat bubble to accompany an Image
            this._buffer.push(url);
        this._buffer.push(new Image({
            url: url,
            alt: url,
        }));
    }

    sendRDL(rdl, icon) {
        this._buffer.push(new BasicCard({
            title: rdl.displayTitle,
            text: rdl.displayText,
            buttons: new Button({
                title: rdl.displayTitle,
                url: rdl.webCallback,
            }),
            image: new Image({
                url: rdl.pictureUrl,
                alt: rdl.pictureUrl
            }),
            display: 'CROPPED',
        }));
    }

    sendChoice(idx, what, title, text) {
        let suggestions = []
        // Filter out buttons more than 25 characters long
        // since Google Assistant has a cap of 25 characters
        if (title.length <= 25)
            suggestions.push(title.substring(0, 25));
        else
            console.log(`${title} exceeds max length of 25 characters`)
        if (suggestions.length)
            this._buffer.push(new Suggestions(suggestions));
    }

    sendButton(title, json) {
        let suggestions = []
        // Filter out buttons more than 25 characters long
        // since Google Assistant has a cap of 25 characters
        if (title.length <= 25)
            suggestions.push(title.substring(0, 25));
        else
            console.log(`${title} exceeds max length of 25 characters`)
        if (suggestions.length)
            this._buffer.push(new Suggestions(suggestions));
    }

    sendLink(title, url) {
        if (url === '/user/register') {
            this._requestSignin = true;
        } else {
            this._buffer.push(new Button({
                title: title,
                url: url,
            }));
        }
    }

    sendResult(message, icon) {
        if (typeof this._buffer[this._buffer.length - 1] === 'string')
            // If there is already a text reply immediately before, we merge text replies
            // because Google Assistant limits at most 2 chat bubbles per turn
            this._buffer[this._buffer.length - 1] += '\n' + message.toLocaleString(this._locale);
        else
            this._buffer.push(message.toLocaleString(this._locale));
    }

    sendAskSpecial(what) {
        // TODO
    }
}
GoogleAssistantDelegate.prototype.$rpcMethods = ['send', 'sendPicture', 'sendChoice', 'sendLink', 'sendButton', 'sendAskSpecial', 'sendRDL', 'sendResult'];

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
router.use(userUtils.requireScope('user-exec-command'));

const app = actionssdk();

// Welcome response when user first initiates conversation
app.intent('actions.intent.MAIN', (conv) => {

    // TODO - retrieve user.id after authentication
    // let user, anonymous;
    // if (conv.request.user.accessToken) {
    //     user = conv.request.user;
    //     anonymous = false;
    // } else {
    //     user = await userUtils.getAnonymousUser();
    //     anonymous = true;
    // }

    let anonymous = true;
    const locale = conv.body.user.locale;
    const conversationId = conv.body.conversation.conversationId;
    const assistantUser = { name: conv.user.name.display || 'User', isOwner: true };
    const delegate = new GoogleAssistantDelegate(locale);

    return Q.try(() => {
        return userUtils.getAnonymousUser();
    }).then((user) => {
        return EngineManager.get().getEngine(user.id);
    }).then((engine) => {
        return engine.assistant.getOrOpenConversation('google_assistant:' + conversationId,
            assistantUser, delegate, { anonymous, showWelcome: true, debug: true });
    }).then(() => {
        // Send welcome message
        delegate._buffer.forEach((reply) => conv.ask(reply));
    });
});

// Immediate response after user authenticates
app.intent('actions.intent.SIGN_IN', (conv, input, signin) => {
    if (signin.status === 'OK')
        conv.ask("Thank you for signing in! What would you like to do next?")
    else
        conv.ask("You were unable to log in. Is there something else you want to do?")
})

// All other responses
app.intent('actions.intent.TEXT', (conv, input) => {
    // Quick hack so that Almond recognizes bye and goodbye
    // and returns user to Google Assistant
    if (input === 'bye' || input === 'goodbye')
        return conv.close("See you later!");
    // TODO - better way for user to initiate sign in
    if (input === 'I want to sign in')
        // This will output "<To get your account details>, I need to link your
        // <action> account to Google. Is that okay?"
        return conv.ask(new SignIn("To get your account details"));

    // TODO - retrieve user.id after authentication
    // let user, anonymous;
    // if (conv.request.user.accessToken) {
    //     user = conv.request.user;
    //     anonymous = false;
    // } else {
    //     user = await userUtils.getAnonymousUser();
    //     anonymous = true;
    // }

    let anonymous = true;
    const locale = conv.body.user.locale;
    const conversationId = conv.body.conversation.conversationId;
    const assistantUser = { name: conv.user.name.display || 'User', isOwner: true };
    const delegate = new GoogleAssistantDelegate(locale);

    return Q.try(() => {
        return userUtils.getAnonymousUser();
    }).then((user) => {
        return EngineManager.get().getEngine(user.id);
    }).then((engine) => {
        return engine.assistant.getOrOpenConversation('google_assistant:' + conversationId,
            assistantUser, delegate, { anonymous, showWelcome: false, debug: true });
    }).then((conversation) => {
        if (input.startsWith('\\t'))
            return conversation.handleThingTalk(input.substring(3));
        else
            return conversation.handleCommand(input);
    }).then(() => {
        if (delegate._buffer) {
            delegate._buffer.forEach((reply) => conv.ask(reply));
            // Another way to initiate authentication, initiated by Almond
            if (delegate._requestSignin)
                conv.ask(new SignIn("To get your account details"));
        } else {
            conv.close("Consider it done.");
        }
    });
});

router.post('/fulfillment', app);

module.exports = router;
