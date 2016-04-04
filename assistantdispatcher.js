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
const Url = require('url');
const Tp = require('thingpedia');

const Sempre = require('sabrina').Sempre;

const omclient = require('omclient').client;

const Messaging = require('./util/messaging');

const API_KEY = '00109b1ea59d9f46d571834870f0168b5ed20005871d8752ff';
const API_SECRET = 'bccb852856c462e748193d6211c730199d62adcf0ba963416fcc715a2db4d76f';

const OmletStateStorage = new lang.Class({
    Name: 'OmletStateStorage',

    _init: function() {
        this._prefs = platform.getSharedPreferences();
        this._storage = this._prefs.get('assistant');
        if (this._storage === undefined)
            this._prefs.set('assistant', this._storage = {});
    },

    key: function(idx) {
        return Object.keys(this._storage)[idx];
    },
    getItem: function(key) {
        return this._storage[key];
    },
    setItem: function(key, value) {
        this._storage[key] = value;
        this._prefs.changed();
    },
    removeItem: function(key) {
        delete this._storage[key];
        this._prefs.changed();
    },
    clear: function() {
        this._storage = {};
        this._prefs.changed();
    }
});

var storage_ = null;
var instance_ = null;

function makeOmletClient(sync) {
    var client = new omclient.Client({ instance: 'assistant',
                                       storage: storage_,
                                       sync: sync,
                                       apiKey: { Id: API_KEY, Secret: API_SECRET } });
    client.longdanMessageConsumer.DEBUG = false;
    return client;
}

const AssistantFeed = new lang.Class({
    Name: 'AssistantFeed',
    $rpcMethods: ['send', 'sendPicture'],

    _init: function(sempre, feed, account, messaging, engine, enginePromise) {
        this.feed = feed;
        this.account = account;
        this.enginePromise = enginePromise;

        this._sempre = sempre;
        this._messaging = messaging;
        this._client = messaging.client;
        this._engine = engine;
        this._newMessageListener = this._onNewMessage.bind(this);
    },

    _onNewMessage: function(msg) {
        if (msg.type === 'text') {
            if (msg.hidden) // hidden messages are used by ThingTalk feed-shared keywords, ignore them
                return;
            this._analyze(msg.text).then(function(analyzed) {
                return this._remote.handleCommand(msg.text, analyzed);
            }.bind(this)).catch(function(e) {
                console.log('Failed to handle assistant command: ' + e.message);
            }).done();
        } else if (msg.type === 'picture') {
            var blob = this._client.blob;

            setTimeout(function() {
                blob.getDownloadLinkForHash(msg.fullSizeHash, function(error, url) {
                    if (error) {
                        console.log('failed to get download link for picture', error);
                        return;
                    }

                    this._remote.handlePicture(url).catch(function(e) {
                        console.log('Failed to handle assistant picture: ' + e.message);
                    }).done();
                }.bind(this));
            }.bind(this), 5000);
        }
    },

    send: function(msg) {
        return this.feed.sendText(msg);
    },

    sendPicture: function(url) {
        return this.feed.sendPicture(url);
    },

    _analyze: function(utterance) {
        return this._sempre.sendUtterance(this.feed.feedId, utterance);
    },

    start: function() {
        return this._engine.assistant.openConversation(this.feed.feedId, this).then(function(conversation) {
            this._remote = conversation;
            this.feed.on('incoming-message', this._newMessageListener);
            return this.feed.open();
        }.bind(this));
    },

    stop: function() {
        this.feed.removeListener('incoming-message', this._newMessageListener);
        return this.feed.close();
    },

    destroy: function() {
        return this._messaging.leaveFeed(this.feed.feedId);
    }
});

module.exports = new lang.Class({
    Name: 'AssistantDispatcher',

    _init: function() {
        instance_ = this;

        this._engines = {};
        this._conversations = {};
        this._sempre = new Sempre(false);

        this._feedAddedListener = this._onFeedAdded.bind(this);
        this._feedChangedListener = this._onFeedChanged.bind(this);
        this._feedRemovedListener = this._onFeedRemoved.bind(this);

        this._client = null;
        this._prefs = platform.getSharedPreferences();
        if (this._prefs.get('assistant') === undefined)
            return;
        this.init();
    },

    get isAvailable() {
        return this._client !== null;
    },

    init: function() {
        storage_ = new OmletStateStorage();
        this._client = makeOmletClient(true);
    },

    _makeConversationWithEngine: function(feed, account, enginePromise) {
        return this._conversations[feed.feedId] = Q.try(function() {
            return enginePromise.then(function(engine) {
                return new AssistantFeed(this._sempre, feed, account, this._messaging, engine, enginePromise);
            }.bind(this)).tap(function(conv) {
                return conv.start();
            });
        }.bind(this)).catch(function(e) {
            console.error('Failed to start conversation on feed ' + feed.feedId);
            console.error(e.stack);
        });
    },

    _makeConversationWithNewUser: function(feed) {
        //feed.sendText('Welcome to Sabrina!');
        //feed.sendText('Unfortunately, this function was not yet implemented');
        //feed.sendText('You must create an account from ThingPedia instead');
        console.log('Rejecting feed ' + feed.feedId + ' because engine is not present');
    },

    _rejectConversation: function(feedId) {
        if (this._conversations[feedId]) {
            var conv = this._conversations[feedId];
            delete this._conversations[feedId];
            return Q(conv).then(function(conv) {
                conv.close();
            });
        }
    },

    _makeConversation: function(feedId, accountId) {
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
                return this._makeConversationWithEngine(feed, user.account, engine);
            else
                return this._makeConversationWithNewUser(feed);
        }.bind(this)).finally(function() {
            return feed.close();
        });
    },

    _onFeedAdded: function(feedId) {
        this._makeConversation(feedId).done();
    },

    _onFeedChanged: function(feedId) {
        if (this._conversations[feedId])
            return;
        this._makeConversation(feedId).done();
    },

    _onFeedRemoved: function(feedId) {
        var conv = this._conversations[feedId];
        delete this._conversations[feedId];
        if (conv) {
            Q(conv).then(function(conv) {
                return conv.stop();
            }).done();
        }
    },

    start: function() {
        if (!this._client)
            return;

        this._client.enable();
        this._sempre.start();
        this._messaging = new Messaging(this._client);
        return this._messaging.start().then(function() {
            return this._messaging.getFeedList();
        }.bind(this)).then(function(feeds) {
            this._messaging.on('feed-added', this._feedAddedListener);
            this._messaging.on('feed-changed', this._feedChangedListener);
            this._messaging.on('feed-removed', this._feedRemovedListener);
            return Q.all(feeds.map(function(f) {
                return this._makeConversation(f);
            }, this));
        }.bind(this));
    },

    stop: function() {
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
    },

    getOrCreateFeedForUser: function(omletId) {
        return this._messaging.addAccountToContacts(omletId)
            .then(function() {
                // this will trigger feed-added which will go through to _makeConversation
                return this._messaging.getFeedWithContact(omletId);
            }.bind(this));
    },

    deleteUser: function(omletId) {
        for (var feedId in this._conversations) {
            var conv = this._conversations[feedId];
            Q(conv).then(function(conv) {
                if (conv.account !== omletId)
                    return;
                conv.destroy();
                // do not stop or delete the conversation here,
                // it will happen as a side effect of leaving the feed
            }.bind(this)).done();
        }
    },

    addEngine: function(omletId, engine) {
        console.log('Added engine for account ' + omletId);
        this._engines[omletId] = Q(engine);
    },

    removeEngine: function(omletId) {
        var enginePromise = this._engines[omletId];
        delete this._engines[omletId];
        for (var feedId in this._conversations) {
            var conv = this._conversations[feedId];
            if (conv.enginePromise === enginePromise) {
                delete this._conversations[feedId];
                Q(conv).then(function() {
                    return conv.stop();
                }.bind(this)).done();
            }
        }
    },

    removeAllEngines: function() {
        this._engines = {};
    },

    getAllFeeds: function() {
        return Object.keys(this._conversations).map(function(feedId) {
            return Q(this._conversations[feedId]).then(function(conv) {
                return conv.feed;
            });
        }, this);
    },
});

module.exports.get = function() {
    return instance_;
}

module.exports.runOAuth2Phase1 = function(req, res) {
    storage_ = new OmletStateStorage();
    var client = makeOmletClient(false);

    return Q.try(function() {
        client.enable();

        return Q.ninvoke(client.auth, 'getAuthPage',
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

module.exports.runOAuth2Phase2 = function(req, res) {
    var client = makeOmletClient(false);

    var code = req.query.code;
    var key = req.session['omlet-query-key'];

    return Q.Promise(function(callback, errback) {
        client.enable();

        client.onSignedUp = callback;
        client.auth.confirmAuth(code, key);
    }).finally(function() {
        client.disable();
    }).then(function() {
        instance_.init();
        instance_.start();
    });
}
