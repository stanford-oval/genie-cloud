// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const events = require('events');
const util = require('util');

const Sabrina = require('sabrina').Sabrina;

class Conversation extends Sabrina {
    constructor(parent, engine, user, delegate) {
        super(engine, user, delegate, true);
        this._parent = parent;
    }

    handlePicture(url) {
        this._parent.setCurrentConversation(this);
        return super.handlePicture(url);
    }

    handleCommand(text, analyzed) {
        this._parent.setCurrentConversation(this);
        return super.handleCommand(text, analyzed);
    }
}
Conversation.prototype.$rpcMethods = ['start', 'handleCommand', 'handlePicture'];

module.exports = class Assistant extends events.EventEmitter {
    constructor(engine) {
        super();

        this._engine = engine;
        this._notify = null;
        this._notifyListener = this.notify.bind(this);
        this._conversations = {};
        this._currentConversation = null;
    }

    notify(data) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].notify(data);
        }.bind(this)));
    }

    setCurrentConversation(conv) {
        this._currentConversation = conv;
    }

    sendReply(msg) {
        if (this._currentConversation)
            return this._currentConversation.sendReply(msg);
        else
            return Q();
    }

    sendPicture(url) {
        if (this._currentConversation)
            return this._currentConversation.sendPicture(url);
        else
            return Q();
    }

    openConversation(feedId, user, delegate) {
        if (this._conversations[feedId])
            return this._conversations[feedId];
        var conv = new Conversation(this, this._engine, user, delegate);
        conv.on('picture', this.emit.bind(this, 'picture'));
        conv.on('message', this.emit.bind(this, 'message'));
        this._conversations[feedId] = conv;
        this._currentConversation = conv;
        return conv;
    }
}
module.exports.prototype.$rpcMethods = ['openConversation'];
