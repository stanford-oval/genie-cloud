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

const EngineManager = require('../../../almond/enginemanagerclient');
const { actionssdk, Image } = require('actions-on-google');

const userUtils = require('../../../util/user');

var router = express.Router();

class GoogleAssistantDelegate {
    constructor(locale) {
        this._buffer = '';
        this._locale = locale;
    }

    send(text, icon) {
        this._buffer += text + '\n';
    }

    sendPicture(url, icon) {
        this._image = new Image({
            url: url,
            alt: url,
        });
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
        // FIXME
    }

    sendResult(message, icon) {
        this._buffer += message.toLocaleString(this._locale) + '\n';
    }

    sendAskSpecial(what) {
        this._askSpecial = what;
    }
}
GoogleAssistantDelegate.prototype.$rpcMethods = ['send', 'sendPicture', 'sendChoice', 'sendLink', 'sendButton', 'sendAskSpecial', 'sendRDL', 'sendResult'];

const app = actionssdk();

// Register handler for Actions SDK

app.intent('actions.intent.MAIN', (conv) => {
    conv.ask("Hello! I'm Almond, your virtual assistant.");
});

app.intent('actions.intent.TEXT', (conv, input) => {
    if (input === 'bye' || input === 'goodbye')
        return conv.close("See you later!");

    let anonymous = true;
    // const userId = conv.user._id || 'UserID';
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
        if (delegate._image) {
            if (delegate._buffer)
                conv.ask(delegate._buffer); // A text output needs to precede the image
            else
                conv.ask("Here is an image.");
            conv.ask(delegate._image);
        } else if (delegate._buffer) {
            conv.ask(delegate._buffer);
        } else {
            conv.close("Consider it done.");
        }
    });
});

router.post('/fulfillment', app);

module.exports = router;
