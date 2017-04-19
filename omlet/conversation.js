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

const User = require('../util/user');
const db = require('../util/db');

module.exports = class Conversation extends events.EventEmitter {
    constructor(feed, omletUser, messaging, engines, almondUser) {
        super();

        this.feed = feed;
        this.account = omletUser.account;

        this._engines = engines;
        this._messaging = messaging;
        this._client = messaging.client;
        this._omletUser = omletUser;
        this._almondUser = almondUser;
        this._engine = null;
        this._remote = null;
        this._hadEngine = false;
        this._registering = false;
        this._newMessageListener = this._onNewMessage.bind(this);
    }

    _registerWithOmlet(engines, msg, account) {
        if (typeof msg['username'] !== 'string' ||
            msg['username'].length == 0 ||
            msg['username'].length > 255)
            throw new Error("You must specify a valid username");
        if (typeof msg['email'] !== 'string' ||
            msg['email'].length == 0 ||
            msg['email'].indexOf('@') < 0 ||
            msg['email'].length > 255)
            throw new Error("You must specify a valid email");
        if (typeof msg['password-hash'] !== 'string' ||
            msg['password-hash'].length !== 64 ||
            typeof msg['salt'] !== 'string' ||
            msg['salt'].length !== 64)
            throw new Error("Invalid password");
        if (typeof msg['timezone'] !== 'string' ||
            typeof msg['locale'] !== 'string' ||
            !/^([a-z+\-0-9_]+\/[a-z+\-0-9_]+|[a-z+\-0-9_]+)$/i.test(msg['timezone']) ||
            !/^[a-z]{2,}-[a-z]{2,}/i.test(msg['locale']))
            throw new Error("Invalid localization data");

            msg.account = account;

        return db.withTransaction((dbClient) => {
            return User.registerWithOmlet(dbClient, msg).then((user) => {
                this._almondUser = user;
                this.emit('registered');
                return this._engines.startUser(user.id);
            });
        }).then(() => {
            return this._tryGetRemote();
        });
    }

    get userId() {
        return this._almondUser !== null ? this._almondUser.id : null;
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
        var hasQuery = url.indexOf('?') >= 0;
        if (url.startsWith('/')) {
            url = 'https://thingengine.stanford.edu' + url;

            if (this._engine) {
                url += (hasQuery ? '&' : '?') + 'auth=omlet'
                       + '&cloudId=' + this._almondUser.cloud_id
                       + '&authToken=' + this._almondUser.auth_token;
            }
        }

        return this.sendRDL({ type: 'rdl', noun: 'link',
                              displayTitle: title,
                              callback: url,
                              webCallback: url });
    }

    sendAskSpecial(what) {
        // ignore all "ask special" calls
    }

    _onHiddenMessage(text) {
        try {
            var parsed = JSON.parse(text);
        } catch(e) {
            console.log('Failed to parse hidden message as JSON: ' + e.message);
            return;
        }

        if (this._registering && parsed.op === 'complete-registration') {
            Q.try(() => {
                return this._registerWithOmlet(parsed, this.account);
            }).catch((e) => {
                this.send("Sorry that did not work: " + e.message);
            }).done();
        }

        if (parsed.op !== undefined) {
            // could be another thingengine internal message, ignore it
            return;
        }

        // this is probably a pre-parsed message in SEMPRE format, used by Almond
        // to do buttons and stuff
        // pass it down to the remote if we have one, otherwise ignore it
        Q.try(() => {
            return this._tryGetRemote();
        }).then(() => {
            if (this._remote) {
                return this._remote.handleParsedCommand(text);
            }
        }).catch(function(e) {
            console.log('Failed to handle assistant command: ' + e.message);
        }).done();
    }

    _onTextMessage(text) {
        Q.try(() => {
            return this._tryGetRemote();
        }).then(function() {
            if (this._remote) {
                return this._remote.handleCommand(text);
            } else {
                return this._handleNoEngine();
            }
        }.bind(this)).catch(function(e) {
            console.log('Failed to handle assistant command: ' + e.message);
        }).done();
    }

    _tryGetRemote() {
        if (this._remote !== null)
            return Q(this._remote);
        if (this._almondUser === null)
            return Q(null);

        return this._engines.getEngine(this._almondUser.id).then((engine) => {
            this._engine = engine;
            return this._engine.assistant.openConversation(this.feed.feedId, this._omletUser, this);
        }).then((conversation) => {
            this._remote = conversation;
            return this._remote.start();
        });
    }

    _handleNoEngine() {
        if (this._almondUser !== null)
            return this.send("Sorry, your Almond died. She will not answer your messages until you restart it.");
        else if (this._registering)
            return this.send("Sorry, you must complete the registration before you interact with Almond.");
        else
            return this._startRegistration();
    }

    _onPicture(hash) {
        var blob = this._client._ldClient.blob;

        // try repeatedly every 2 seconds for 10 times until we get the blob
        var count = 0;
        var interval = setInterval(() => {
            blob.getDownloadLinkForHash(hash, (error, url) => {
                count++;
                if (count >= 10)
                    clearInterval(interval);
                if (error === 'Blob not found')
                    return;
                clearInterval(interval);
                if (error) {
                    console.log('failed to get download link for picture', error);
                    return;
                }

                Q.try(() => {
                    return this._tryGetRemote();
                }).then(() => {
                    if (this._remote) {
                        return this._remote.handleParsedCommand(JSON.stringify({ answer: {
                            name: { id: 'tt:param.answer' },
                            type: 'Picture',
                            value: { value: url }
                        } }));
                    } else {
                        return this._handleNoEngine();
                    }
                }).catch(function(e) {
                    console.log('Failed to handle assistant picture: ' + e.message);
                }).done();
            });
        }, 2000);
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

    _startRegistration() {
        this._registering = true;
        this.feed.sendText('Welcome to Almond!');
        this.feed.sendText('You must complete the registration before continuing');
        this.feed.sendRaw({ type: 'rdl', noun: 'app',
                            displayTitle: "Complete registration",
                            displayText: "Click here to set up username and password",
                            callback: platform.getOrigin() + '/omlet/register',
                            webCallback: platform.getOrigin() + '/user/register' });
    }

    removeEngine() {
        this._remote = null;
        this._engine = null;
    }

    start(newFeed) {
        return Q.try(() => {
            this.feed.on('incoming-message', this._newMessageListener);
            return this.feed.open();
        }).then(() => {
            if (this._almondUser)
                return this._tryGetRemote();
            else if (newFeed)
                return this._startRegistration();
        });
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
                                        'sendChoice', 'sendButton', 'sendLink',
                                        'sendAskSpecial'];
