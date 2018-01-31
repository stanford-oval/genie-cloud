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
const Url = require('url');

const Messaging = require('./messaging');
const OmletFactory = require('./omlet');
const Conversation = require('./conversation');

const EngineManagerClient = require('../almond/enginemanagerclient');
const userModel = require('../model/user');
const db = require('../util/db');

var instance_ = null;

module.exports = class AssistantDispatcher {
    constructor() {
        instance_ = this;

        this._engines = new EngineManagerClient();
        this._engines.on('socket-closed', (userId) => {
            this.removeEngine(userId);
        });

        this._conversations = {};
        this._conversationsByUserId = {};
        this._initialFeeds = {};

        this._feedAddedListener = this._onFeedAdded.bind(this);
        this._feedChangedListener = this._onFeedChanged.bind(this);
        this._feedRemovedListener = this._onFeedRemoved.bind(this);

        this._client = null;
    }

    _addConversationToUser(conv, userId) {
        if (userId === null)
            return;
        if (!this._conversationsByUserId[userId])
            this._conversationsByUserId[userId] = [];
        this._conversationsByUserId[userId].push(conv);
    }

    _removeConversationFromUser(conv, userId) {
        if (userId === null)
            return;
        var conversations = this._conversationsByUserId[userId] || [];
        var idx = conversations.indexOf(conv);
        if (idx < 0)
            return;
        conversations.splice(idx, 1);
    }

    _makeConversationForAccount(feed, user, almondUser, newFeed) {
        return this._conversations[feed.feedId] = Q.delay(500).then(function() {
            var conv = new Conversation(feed, user, this._messaging, this._engines, almondUser);
            if (!almondUser) {
                conv.on('registered', () => {
                    this._addConversationToUser(conv, conv.userId);
                });
            }
            return conv.start(newFeed).then(function() {
                this._addConversationToUser(conv, conv.userId);
                return conv;
            }.bind(this));
        }.bind(this)).catch(function(e) {
            console.error('Failed to start conversation on feed ' + feed.feedId);
            console.error(e.stack);
        });
    }

    _rejectConversation(feedId) {
        if (this._conversations[feedId]) {
            var conv = this._conversations[feedId];
            delete this._conversations[feedId];
            return Q(conv).then(function(conv) {
                this._removeConversationFromUser(conv, conv.userId);
                return conv.stop();
            });
        }
    }

    _makeConversation(feedId, newFeed) {
        var feed = this._messaging.getFeed(feedId);
        return feed.open().then(function() {
            var members = feed.getMembers();
            if (members.length < 2) {
                console.log('Ignored feed ' + feedId);
                return this._rejectConversation(feedId);
            }
            if (members.length >= 3) {
                console.log('Rejected feed ' + feedId);
                //return feed.sendText("Almond cannot be added to a group chat");
                return this._rejectConversation(feedId);
            }
            if (this._conversations[feedId])
                return;

            var user = members[1];
            console.log('Found conversation with account ' + user.account);

            return db.withClient((dbClient) => {
                return userModel.getByOmletAccount(dbClient, user.account);
            }).then((rows) => {
                if (rows.length > 0) {
                    return rows[0];
                } else {
                    return null;
                }
            }).then((almondUser) => {
                if (almondUser)
                    return this._makeConversationForAccount(feed, user, almondUser, false);
                else
                    return this._makeConversationForAccount(feed, user, null, newFeed);
            });
        }.bind(this)).finally(function() {
            return feed.close();
        });
    }

    _onFeedAdded(feedId) {
        this._makeConversation(feedId, true).done();
    }

    _onFeedChanged(feedId) {
        if (this._conversations[feedId])
            return;
        this._makeConversation(feedId, !this._initialFeeds[feedId]).done();
    }

    _onFeedRemoved(feedId) {
        var conv = this._conversations[feedId];
        delete this._conversations[feedId];
        if (conv) {
            Q(conv).then(function(conv) {
                this._removeConversationFromUser(conv, conv.userId);
                return conv.stop();
            }.bind(this)).done();
        }
    }

    start() {
        this._prefs = platform.getSharedPreferences();
        if (this._prefs.get('assistant') === undefined)
            throw new Error('Assistant is not configured');

        this._client = OmletFactory();
        this._client.connect();
        this._messaging = new Messaging(this._client);
        return this._messaging.start().then(function() {
            return this._messaging.getFeedList();
        }.bind(this)).then(function(feeds) {
            this._messaging.on('feed-added', this._feedAddedListener);
            this._messaging.on('feed-changed', this._feedChangedListener);
            this._messaging.on('feed-removed', this._feedRemovedListener);
            return Q.all(feeds.map(function(f) {
                this._initialFeeds[f] = true;
                return this._makeConversation(f, false);
            }, this));
        }.bind(this));
    }

    stop() {
        if (!this._client)
            return Q();
        this._client.disable();

        this._messaging.removeListener('feed-added', this._feedAddedListener);
        this._messaging.removeListener('feed-changed', this._feedChangedListener);
        this._messaging.removeListener('feed-removed', this._feedRemovedListener);

        var promises = [];
        for (var feedId in this._conversations)
            promises.push(Q(this._conversations[feedId]).then(function(conv) { return conv.stop(); }));
        this._conversations = {};

        return Q.all(promises);
    }

    getOrCreateFeedForUser(omletId) {
        return this._messaging.addAccountToContacts(omletId)
            .then(function() {
                // this will trigger feed-added which will go through to _makeConversation
                return this._messaging.getFeedWithContact(omletId);
            }.bind(this));
    }

    removeEngine(userId) {
        var conversations = this._conversationsByUserId[userId] || [];
        conversations.forEach(function(conv) {
            conv.removeEngine();
        });
    }

    static get() {
        return instance_;
    }
}
