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
    _handleSparql(sparql) {
        try {
            var stream = this._engine.sparql.runQuery(sparql);

            stream.on('data', (d) => {
                this.sendReply(util.inspect(d));
            });
            stream.on('end', () => {
                this.sendReply("Done");
            });
            stream.on('error', (e) => {
                this.sendReply("Error: " + e.message);
            });
        } catch(e) {
            console.error(e.stack);
        }
    }

    handleCommand(command, analyzed) {
        if (command.toLowerCase() === 'who are my friends')
            this._handleSparql('prefix tp: <http://thingengine.stanford.edu/rdf/0.1/> ' +
                               'prefix tpo: <http://thingengine.stanford.edu/ontology/0.1/#> ' +
                               'prefix foaf: <http://xmlns.com/foaf/0.1/> ' +
                               'select ?name from <http://thingengine.stanford.edu/rdf/0.1/me/@omlet> ' +
                               '{ tp:me foaf:knows ?who . ?who foaf:name ?name }');
        else if (command.toLowerCase() === 'how many friends do i have')
            this._handleSparql('prefix tp: <http://thingengine.stanford.edu/rdf/0.1/> ' +
                               'prefix tpo: <http://thingengine.stanford.edu/ontology/0.1/#> ' +
                               'prefix foaf: <http://xmlns.com/foaf/0.1/> ' +
                               'select (count(?who) as ?count) from <http://thingengine.stanford.edu/rdf/0.1/me/@omlet> ' +
                               '{ tp:me foaf:knows ?who }');
        else
            super.handleCommand(command, analyzed);
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
    }

    notify(data) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].notify(data);
        }.bind(this)));
    }

    sendReply(msg) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].sendReply(msg);
        }.bind(this)));
    }

    sendPicture(url) {
        return Q.all(Object.keys(this._conversations).map(function(id) {
            return this._conversations[id].sendPicture(url);
        }.bind(this)));
    }

    openConversation(feedId, user, delegate) {
        if (this._conversations[feedId])
            return this._conversations[feedId];
        var conv = new Conversation(this._engine, user, delegate);
        conv.on('picture', this.emit.bind(this, 'picture'));
        conv.on('message', this.emit.bind(this, 'message'));
        this._conversations[feedId] = conv;
        return conv;
    }

    start() {
        return this._engine.ui.getAllNotify().then(function(notify) {
            this._notify = notify;
            notify.on('data', this._notifyListener);
        }.bind(this));
    }

    stop() {
        if (this._notify) {
            this._notify.removeListener('data', this._notifyListener);
            return this._notify.close();
        } else {
            return Q();
        }
    }
}
module.exports.prototype.$rpcMethods = ['openConversation'];
