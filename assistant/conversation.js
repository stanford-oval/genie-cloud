// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const User = require('../util/user');
const db = require('../util/db');

function registerWithOmlet(msg, account) {
    var username, passwordHash, salt, email;
    if (typeof msg['username'] !== 'string' ||
        msg['username'].length == 0 ||
        msg['username'].length > 255)
        throw new Error("You must specify a valid username");
    username = msg['username'];
    if (typeof msg['email'] !== 'string' ||
        msg['email'].length == 0 ||
        msg['email'].indexOf('@') < 0 ||
        msg['email'].length > 255)
        throw new Error("You must specify a valid email");
    email = msg['email'];

    if (typeof msg['password-hash'] !== 'string' ||
        msg['password-hash'].length !== 64 ||
        typeof msg['salt'] !== 'string' ||
        msg['salt'].length !== 64)
        throw new Error("Invalid password");
    passwordHash = msg['password-hash'];
    salt = msg['salt'];

    return db.withTransaction(function(dbClient) {
        return User.registerWithOmlet(dbClient, username, salt, passwordHash, account, email).then(function(user) {
            return require('../lib/enginemanager').get().startUser(user);
        });
    });
}

module.exports = class Conversation {
    constructor(sempre, feed, user, messaging, enginePromise) {
        this.feed = feed;
        this.account = user.account;
        this.enginePromise = enginePromise;

        this._sempre = sempre;
        this._messaging = messaging;
        this._client = messaging.client;
        this._user = user;
        this._engine = null;
        this._remote = null;
        this._hadEngine = false;
        this._registering = false;
        this._newMessageListener = this._onNewMessage.bind(this);
    }

    send(msg) {
        return this.feed.sendText(msg);
    }

    sendPicture(url) {
        return this.feed.sendPicture(url);
    }

    sendRDL(rdl) {
        return this.feed.sendRaw(rdl);
    }

    sendChoice(idx, what, title, text) {
        var url = 'https://web.stanford.edu/~gcampagn/sabrina/choice.html#' + idx;
        return this.sendRDL({ type: 'rdl', noun: what,
                              displayTitle: title,
                              callback: url,
                              webCallback: url });
    }

    sendButton(text, json) {
        var url = 'https://web.stanford.edu/~gcampagn/sabrina/echo.html#' + encodeURIComponent(json);
        return this.sendRDL({ type: 'rdl', noun: 'button',
                              displayTitle: text,
                              callback: url,
                              webCallback: url });
    }

    sendLink(title, url) {
        if (url.startsWith('/'))
            url = 'https://thingengine.stanford.edu' + url;
        return this.sendRDL({ type: 'rdl', noun: 'link',
                              displayTitle: title,
                              callback: url,
                              webCallback: url });
    }

    setEngine(enginePromise) {
        // new engine means new RpcSocket, so we must clear our old ID
        delete this.$rpcId;
        this._registering = false;

        this.enginePromise = enginePromise;
        if (enginePromise) {
            this._startWithEngine().then(function() {
                return this._remote.start();
            }.bind(this)).catch(function(e) {
                console.error('Failed to start conversation on feed ' + this.feed.feedId);
                console.error(e.stack);
            }.bind(this)).done();
        } else {
            this._engine = null;
            this._remote = null;
        }
    }

    _onHiddenMessage(text) {
        try {
            var parsed = JSON.parse(text);
        } catch(e) {
            console.log('Failed to parse hidden message as JSON: ' + e.message);
            return;
        }

        if (this._registering && parsed.op === 'complete-registration') {
            Q.try(function() {
                return registerWithOmlet(parsed, this.account);
            }.bind(this)).catch(function(e) {
                this.send("Sorry that did not work: " + e.message);
            }.bind(this)).done();
        }

        if (parsed.op !== undefined) {
            // could be another thingengine internal message, ignore it
            return;
        }

        // this is probably a pre-parsed message in SEMPRE format, used by Sabrina
        // to do buttons and stuff
        // pass it down to the remote if we have one, otherwise ignore it
        if (this._remote) {
            this._remote.handleCommand(null, text).catch(function(e) {
                console.log('Failed to handle assistant command: ' + e.message);
            }).done();
        }
    }

    _onTextMessage(text) {
        this._analyze(text).then(function(analyzed) {
            if (this._remote) {
                return this._remote.handleCommand(text, analyzed);
            } else {
               this._handleNoEngine();
            }
        }.bind(this)).catch(function(e) {
            console.log('Failed to handle assistant command: ' + e.message);
        }).done();
    }

    _handleNoEngine() {
        if (this._hadEngine)
            this.send("Sorry, your Sabrina died. She will not answer your messages until you restart it.").done();
        else if (this._registering)
            this.send("Sorry, you must complete the registration before you interact with Sabrina.").done();
        else
            this._startRegistration();
    }

    _onPicture(hash) {
        var blob = this._client.blob;

        setTimeout(function() {
            blob.getDownloadLinkForHash(hash, function(error, url) {
                if (error) {
                    console.log('failed to get download link for picture', error);
                    return;
                }

                if (this._remote) {
                    this._remote.handlePicture(url).catch(function(e) {
                        console.log('Failed to handle assistant picture: ' + e.message);
                    }).done();
                } else {
                    this._handleNoEngine();
                }
            }.bind(this));
        }.bind(this), 5000);
    }

    _onNewMessage(msg) {
        if (msg.type === 'text') {
            if (msg.hidden)
                this._onHiddenMessage(msg.text);
            else
                this._onTextMessage(msg.text);
        } else if (msg.type === 'picture') {
            this._onPicture(msg.fullSizeHash);
        }
    }

    _analyze(utterance) {
        return this._sempre.sendUtterance(utterance);
    }

    _startRegistration() {
        this._registering = true;
        this.feed.sendText('Welcome to Sabrina!');
        this.feed.sendText('You must complete the registration before continuing');
        this.feed.sendRaw({ type: 'rdl', noun: 'app',
                            displayTitle: "Complete registration",
                            displayText: "Click here to set up username and password",
                            callback: platform.getOrigin() + '/omlet/register',
                            webCallback: platform.getOrigin() + '/user/register' });
    }

    _startWithEngine() {
        this._hadEngine = true;
        return this.enginePromise.then(function(engine) {
            this._engine = engine;
            return this._engine.assistant.openConversation(this.feed.feedId, this._user, this);
        }.bind(this)).then(function(conversation) {
            this._remote = conversation;
        }.bind(this));
    }

    start(newFeed) {
        return Q.try(function() {
            if (this.enginePromise)
                return this._startWithEngine();
            else if (newFeed)
                return this._startRegistration();
        }.bind(this)).then(function() {
            this.feed.on('incoming-message', this._newMessageListener);
            return this.feed.open();
        }.bind(this)).then(function() {
            if (this._remote)
                return this._remote.start();
        }.bind(this));
    }

    stop() {
        this.feed.removeListener('incoming-message', this._newMessageListener);
        return this.feed.close();
    }

    destroy() {
        return this._messaging.leaveFeed(this.feed.feedId);
    }
}
module.exports.prototype.$rpcMethods = ['send', 'sendPicture', 'sendRDL',
                                        'sendChoice', 'sendButton', 'sendLink'];
