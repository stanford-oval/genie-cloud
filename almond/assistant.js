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
const assert = require('assert');

const Almond = require('almond-dialog-agent');
const AlmondApi = require('./almond_api');
const TimedCache = require('../util/timed_cache');

const Config = require('../config');

const CONVERSATION_TTL = 300000; // 5 minutes

class Conversation extends Almond {
}
Conversation.prototype.$rpcMethods = ['start', 'handleCommand', 'handleParsedCommand', 'handleThingTalk'];

class StatelessConversationDelegate {
    constructor(locale) {
        this._locale = locale;
        this._buffer = [];
        this._askSpecial = null;
    }

    flush() {
        const buffer = this._buffer;
        const askSpecial = this._askSpecial;
        this._buffer = [];
        this._askSpecial = null;
        return {
            messages: buffer,
            askSpecial: askSpecial,
        };
    }

    send(text, icon) {
        this._buffer.push({ type: 'text', text, icon });
    }

    sendPicture(url, icon) {
        this._buffer.push({ type: 'picture', url, icon });
    }

    sendChoice(idx, what, title, text) {
        this._buffer.push({ type: 'choice', idx, title, text });
    }

    sendLink(title, url) {
        this._buffer.push({ type: 'link', title, url });
    }

    sendButton(title, json) {
        this._buffer.push({ type: 'button', title, json });
    }

    sendRDL(rdl, icon) {
        this._buffer.push({ type: 'rdl', rdl, icon });
    }

    sendResult(message, icon) {
        this._buffer.push({
            type: 'result',
            result: message,

            fallback: message.toLocaleString(this._locale),
            icon
        });
    }

    sendAskSpecial(what) {
        assert(this._askSpecial === null);
        this._askSpecial = what;
    }
}

module.exports = class Assistant extends events.EventEmitter {
    constructor(engine, options) {
        super();

        this._url = Config.NL_SERVER_URL;
        if (options.modelTag !== null &&
            options.modelTag !== 'default' &&
            options.modelTag !== 'org.thingpedia.models.default')
            this._url += '/@' + options.modelTag;
        this._engine = engine;
        this._platform = engine.platform;
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

    async converse(command, user, conversationId) {
        const conversation = await this.getOrOpenConversation(conversationId, user, new StatelessConversationDelegate(this._platform.locale), {
            showWelcome: false,
            anonymous: false
        });
        const delegate = conversation._delegate;

        switch (command.type) {
        case 'command':
            await conversation.handleCommand(command.text);
            break;
        case 'parsed':
            await conversation.handleParsedCommand(command.json);
            break;
        case 'tt':
            await conversation.handleThingTalk(command.code);
            break;
        default:
            throw new Error('Invalid command type ' + command.type);
        }

        const result = delegate.flush();
        result.conversationId = conversation.id;
        return result;
    }

    async notifyAll(...data) {
        const promises = [];
        for (let conv of this._conversations.values()) {
            if (!(conv._delegate instanceof StatelessConversationDelegate))
                promises.push(conv.notify(...data));
        }
        await Promise.all(promises);
    }

    async notifyErrorAll(...data) {
        const promises = [];
        for (let conv of this._conversations.values()) {
            if (!(conv._delegate instanceof StatelessConversationDelegate))
                promises.push(conv.notifyError(...data));
        }
        await Promise.all(promises);
    }

    getConversation(id) {
        if (id !== undefined && this._conversations.has(id))
            return this._conversations.get(id);
        else
            return this._lastConversation;
    }

    _freeConversation(conv) {
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
            if (!(conv._delegate instanceof StatelessConversationDelegate))
                this._lastConversation = conv;

            // refresh the timer
            this._conversations.set(id, conv, CONVERSATION_TTL, this._freeConversation.bind(this));
        });
        if (!(conv._delegate instanceof StatelessConversationDelegate))
            this._lastConversation = conv;
        this._conversations.set(id, conv, CONVERSATION_TTL, this._freeConversation.bind(this));
        return conv;
    }

    closeConversation(id) {
        this._conversations.delete(id);
    }
};
module.exports.prototype.$rpcMethods = ['openConversation', 'closeConversation', 'getConversation', 'getOrOpenConversation', 'parse', 'createApp', 'addOutput', 'removeOutput', 'converse'];
