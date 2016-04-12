// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const lang = require('lang');
const events = require('events');
const adt = require('adt');

const Sabrina = require('sabrina').Sabrina;

var Conversation = new lang.Class({
    Name: 'Conversation',
    Extends: Sabrina,
    $rpcMethods: ['start', 'handleCommand', 'handlePicture'],
});

module.exports = new lang.Class({
    Name: 'Assistant',
    Extends: events.EventEmitter,
    $rpcMethods: ['openConversation'],

    _init: function(engine) {
        events.EventEmitter.call(this);

        this._engine = engine;
        this._notify = null;
        this._notifyListener = this.notify.bind(this);
        this._conversations = {};
    },

    notify: function(data) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].notify(data);
        }.bind(this)));
    },

    sendReply: function(msg) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].sendReply(msg);
        }.bind(this)));
    },

    sendPicture: function(url) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].sendPicture(url);
        }.bind(this)));
    },

    openConversation: function(feedId, user, delegate) {
        if (this._conversations[feedId])
            return this._conversations[feedId];
        var conv = new Conversation(this._engine, user, delegate);
        conv.on('picture', this.emit.bind(this, 'picture'));
        conv.on('message', this.emit.bind(this, 'message'));
        this._conversations[feedId] = conv;
        return conv;
    },

    start: function() {
        return this._engine.ui.getAllNotify().then(function(notify) {
            this._notify = notify;
            notify.on('data', this._notifyListener);
        }.bind(this));
    },

    stop: function() {
        if (this._notify) {
            this._notify.removeListener('data', this._notifyListener);
            return this._notify.close();
        } else {
            return Q();
        }
    }
});
