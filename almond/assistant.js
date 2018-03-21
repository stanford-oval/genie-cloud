// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const events = require('events');

const Almond = require('almond');
const AlmondApi = require('./almond_api');

class Conversation extends Almond {
}
Conversation.prototype.$rpcMethods = ['start', 'handleCommand', 'handleParsedCommand', 'handleThingTalk'];

module.exports = class Assistant extends events.EventEmitter {
    constructor(engine) {
        super();

        this._engine = engine;
        this._conversations = {};
        this._lastConversation = null;

        this._api = new AlmondApi(this._engine);
        this._conversations['api'] = this._api;
    }

    parse(sentence, targetJson) {
        return this._api.parse(sentence, targetJson);
    }
    createApp(data) {
        return this._api.createApp(data);
    }
    addOutput(out) {
        this._api.addOutput(out);
    }
    removeOutput(out) {
        this._api.removeOutput(out);
        out.$free();
    }

    notifyAll(...data) {
        return Q.all(Object.keys(this._conversations).map((id) => {
            return this._conversations[id].notify(...data);
        }));
    }

    notifyErrorAll(...data) {
        return Q.all(Object.keys(this._conversations).map((id) => {
            return this._conversations[id].notifyError(...data);
        }));
    }

    getConversation(id) {
        if (id !== undefined && this._conversations[id])
            return this._conversations[id];
        else
            return this._lastConversation;
    }

    getOrOpenConversation(id, user, delegate, options) {
        if (this._conversations[id]) {
            this._conversations[id]._delegate = delegate;
            return Promise.resolve(this._conversations[id]);
        }
        let conv = this.openConversation(id, user, delegate, options);
        return Promise.resolve(conv.start()).then(() => conv);
    }

    openConversation(feedId, user, delegate, options) {
        if (this._conversations[feedId]) {
            this._conversations[feedId].$free();
            delete this._conversations[feedId];
        }
        var conv = new Conversation(this._engine, feedId, user, delegate, options);
        conv.on('active', () => this._lastConversation = conv);
        this._lastConversation = conv;
        this._conversations[feedId] = conv;
        return conv;
    }

    closeConversation(feedId) {
        if (this._conversations[feedId])
            this._conversations[feedId].$free();
        if (this._conversations[feedId] === this._lastConversation)
            this._lastConversation = null;
        delete this._conversations[feedId];
    }
};
module.exports.prototype.$rpcMethods = ['openConversation', 'closeConversation', 'getConversation', 'getOrOpenConversation', 'parse', 'createApp', 'addOutput', 'removeOutput'];
