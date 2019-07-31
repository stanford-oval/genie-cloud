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

const events = require('events');

const Almond = require('almond-dialog-agent');
const AlmondApi = require('./almond_api');
const TimedCache = require('../util/timed_cache');

const Config = require('../config');

const CONVERSATION_TTL = 300000; // 5 minutes

class Conversation extends Almond {
}
Conversation.prototype.$rpcMethods = ['start', 'handleCommand', 'handleParsedCommand', 'handleThingTalk'];

module.exports = class Assistant extends events.EventEmitter {
    constructor(engine, options) {
        super();

        this._url = Config.NL_SERVER_URL;
        if (options.modelTag !== null &&
            options.modelTag !== 'default' &&
            options.modelTag !== 'org.thingpedia.models.default')
            this._url += '/@' + options.modelTag;
        this._engine = engine;
        this._lastConversation = null;

        this._api = new AlmondApi(this._engine);
        this._conversations = new TimedCache();
        this._conversations.set('api', this._api, null);
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

    async notifyAll(...data) {
        const promises = [];
        for (let conv of this._conversations.values())
            promises.push(conv.notify(...data));
        await Promise.all(promises);
    }

    async notifyErrorAll(...data) {
        const promises = [];
        for (let conv of this._conversations.values())
            promises.push(conv.notifyError(...data));
        await Promise.all(promises);
    }

    getConversation(id) {
        if (id !== undefined && this._conversations.has(id))
            return this._conversations.get(id);
        else
            return this._lastConversation;
    }

    _freeConversation(conv) {
        conv.$free();
        if (conv === this._lastConversation)
            this._lastConversation = null;
    }

    async getOrOpenConversation(id, user, delegate, options) {
        if (this._conversations.has(id)) {
            const conv = this._conversations.get(id);
            conv._delegate = delegate;
            // NOTE: we don't refresh the timer here, but the caller is likely to make the conversation
            // active again, which will restart the timer
            return conv;
        }
        options = options || {};
        options.sempreUrl = this._url;
        let conv = this.openConversation(id, user, delegate, options);
        await conv.start();
        return conv;
    }

    openConversation(id, user, delegate, options) {
        this._conversations.delete(id);
        options = options || {};
        options.sempreUrl = this._url;
        var conv = new Conversation(this._engine, id, user, delegate, options);
        conv.on('active', () => {
            this._lastConversation = conv;

            // refresh the timer
            this._conversations.set(id, conv, CONVERSATION_TTL, this._freeConversation.bind(this));
        });
        this._lastConversation = conv;
        this._conversations.set(id, conv, CONVERSATION_TTL, this._freeConversation.bind(this));
        return conv;
    }

    closeConversation(id) {
        this._conversations.delete(id);
    }
};
module.exports.prototype.$rpcMethods = ['openConversation', 'closeConversation', 'getConversation', 'getOrOpenConversation', 'parse', 'createApp', 'addOutput', 'removeOutput'];
