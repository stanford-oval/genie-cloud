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

const Almond = require('sabrina');

class Conversation extends Almond {
    constructor(engine, user, delegate, options) {
        super(engine, user, delegate, options);
    }
}
Conversation.prototype.$rpcMethods = ['start', 'handleCommand', 'handleParsedCommand'];

module.exports = class Assistant extends events.EventEmitter {
    constructor(engine) {
        super();

        this._engine = engine;
        this._conversations = {};
    }

    notify(data) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].notify(data);
        }.bind(this)));
    }

    notifyError(data) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].notifyError(data);
        }.bind(this)));
    }

    openConversation(feedId, user, delegate, options) {
        if (this._conversations[feedId]) {
            this._conversations[feedId].$free();
            delete this._conversations[feedId];
        }
        var conv = new Conversation(this._engine, user, delegate, options);
        this._conversations[feedId] = conv;
        return conv;
    }

    closeConversation(feedId) {
        if (this._conversations[feedId])
            this._conversations[feedId].$free();
        delete this._conversations[feedId];
    }
}
module.exports.prototype.$rpcMethods = ['openConversation', 'closeConversation'];
