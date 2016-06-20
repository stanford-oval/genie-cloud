// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const Url = require('url');

const Sempre = require('sabrina').Sempre;

const Messaging = require('./messaging');
const OmletFactory = require('./omlet');
const Conversation = require('./conversation');

var instance_ = null;

class FakeSempre {
    constructor() {
        console.log('Using fake sempre');
    }

    start() {}
    stop() {}

    openSession() {
        return {
            sendUtterance(utt) {
                if (/yes/i.test(utt))
                    return Q(JSON.stringify({"special":"tt:root.special.yes"}));
                else if (/no/i.test(utt))
                    return Q(JSON.stringify({"special":"tt:root.special.no"}));
                else
                    return Q(JSON.stringify({"special":"tt:root.special.failed"}));
            }
        }
    }
}

module.exports = class AssistantDispatcher {
    constructor() {
        instance_ = this;

        this._engines = {};
        this._conversations = {};
        this._conversationsByAccount = {};
        this._initialFeeds = {};
        if (process.env.THINGENGINE_DISABLE_SEMPRE === '1')
            this._sempre = new FakeSempre();
        else
            this._sempre = new Sempre();

        this._feedAddedListener = this._onFeedAdded.bind(this);
        this._feedChangedListener = this._onFeedChanged.bind(this);
        this._feedRemovedListener = this._onFeedRemoved.bind(this);

        this._client = null;
        this._prefs = platform.getSharedPreferences();
        if (this._prefs.get('assistant') === undefined)
            return;
        this.init();
    }

    get isAvailable() {
        return this._client !== null;
    }

    init() {
        this._client = OmletFactory();
    }

    _addConversationToAccount(conv, account) {
        if (!this._conversationsByAccount[account])
            this._conversationsByAccount[account] = [];
        this._conversationsByAccount[account].push(conv);
    }

    _removeConversationFromAccount(conv, account) {
        var conversations = this._conversationsByAccount[account] || [];
        var idx = conversations.indexOf(conv);
        if (idx < 0)
            return;
        conversations.splice(idx, 1);
    }

    _makeConversationForAccount(feed, user, enginePromise, newFeed) {
        return this._conversations[feed.feedId] = Q.delay(500).then(function() {
            var conv = new Conversation(this._sempre.openSession(), feed, user, this._messaging, enginePromise);
            return conv.start(newFeed).then(function() {
                this._addConversationToAccount(conv, user.account);
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
                this._removeConversationFromAccount(conv, conv.account);
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
                //return feed.sendText("Sabrina cannot be added to a group chat");
                return this._rejectConversation(feedId);
            }
            if (this._conversations[feedId])
                return;

            var user = members[1];
            console.log('Found conversation with account ' + user.account);
            var engine = this._engines[user.account];
            if (engine)
                return this._makeConversationForAccount(feed, user, engine, false);
            else
                return this._makeConversationForAccount(feed, user, null, newFeed);
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
                this._removeConversationFromAccount(conv, conv.account);
                return conv.stop();
            }.bind(this)).done();
        }
    }

    start() {
        if (!this._client)
            return;

        this._client.connect();
        this._sempre.start();
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
        this._sempre.stop();

        this._messaging.removeListener('feed-added', this._feedAddedListener);
        this._messaging.removeListener('feed-changed', this._feedChangedListener);
        this._messaging.removeListener('feed-removed', this._feedRemovedListener);

        var promises = [];
        for (var feedId in this._conversations)
            promises.push(Q(this._conversations[feedId]).then(function(conv) { return conv.stop(); }));
        this._conversations = {};

        return promises;
    }

    getOrCreateFeedForUser(omletId) {
        return this._messaging.addAccountToContacts(omletId)
            .then(function() {
                // this will trigger feed-added which will go through to _makeConversation
                return this._messaging.getFeedWithContact(omletId);
            }.bind(this));
    }

    deleteUser(omletId) {
        var conversations = this._conversationsByAccount[omletId] || [];
        conversations.forEach(function(conv) {
            conv.destroy().catch(function(e) {
                console.error('Failed to destroy conversation: ' + e.message);
                console.error(e.stack);
                // do not stop or delete the conversation here,
                // it will happen as a side effect of leaving the feed
            }).done();
        });
    }

    addEngine(omletId, engine) {
        var promise = Q(engine);
        this._engines[omletId] = promise;
        var conversations = this._conversationsByAccount[omletId] || [];
        conversations.forEach(function(conv) {
            conv.setEngine(promise);
        });
    }

    removeEngine(omletId) {
        var enginePromise = this._engines[omletId];
        delete this._engines[omletId];
        var conversations = this._conversationsByAccount[omletId] || [];
        conversations.forEach(function(conv) {
            conv.setEngine(null);
        });
    }

    removeAllEngines() {
        this._engines = {};
    }

    getAllFeeds() {
        return Object.keys(this._conversations).map(function(feedId) {
            return Q(this._conversations[feedId]).then(function(conv) {
                return conv.feed;
            });
        }, this);
    }

    static get() {
        return instance_;
    }

    static runOAuth2Phase1(req, res) {
        var client = OmletFactory();

        return Q.try(function() {
            client.connect();

            return Q.ninvoke(client._ldClient.auth, 'getAuthPage',
                             platform.getOrigin() + '/admin/assistant-setup/callback',
                             ['PublicProfile', 'OmletChat']);
        }).then(function(resp) {
            var parsed = Url.parse(resp.Link, true);
            req.session['omlet-query-key'] = parsed.query.k;
            res.redirect(resp.Link);
        }).finally(function() {
            return client.disable();
        });
    }

    static runOAuth2Phase2(req, res) {
        var client = OmletFactory();

        var code = req.query.code;
        var key = req.session['omlet-query-key'];

        return Q.Promise(function(callback, errback) {
            client.connect();

            client._ldClient.onSignedUp = callback;
            client._ldClient.auth.confirmAuth(code, key);
        }).finally(function() {
            client.disable();
        }).then(function() {
            instance_.init();
            instance_.start();
        });
    }
}
