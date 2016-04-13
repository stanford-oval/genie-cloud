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
const fs = require('fs');
const Url = require('url');
const Tp = require('thingpedia');

const Sempre = require('sabrina').Sempre;

const omclient = require('omclient').client;

const Messaging = require('./util/messaging');
const User = require('./util/user');
const db = require('./util/db');

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

function safeMkdirSync(dir) {
    try {
        fs.mkdirSync(dir);
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
}

function makeOmletClient(sync) {
    var dbpath = platform.getWritableDir() + '/omlet-assistant';
    safeMkdirSync(dbpath);
    var client = new omclient.Client({ instance: 'assistant',
                                       storage: storage_,
                                       dbpath: dbpath,
                                       sync: sync,
                                       apiKey: { Id: API_KEY, Secret: API_SECRET } });
    client.longdanMessageConsumer.DEBUG = false;
    return client;
}

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
            return require('./enginemanager').get().startUser(user);
        });
    });
}

const AssistantFeed = new lang.Class({
    Name: 'AssistantFeed',
    $rpcMethods: ['send', 'sendPicture'],

    _init: function(sempre, feed, user, messaging, enginePromise) {
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
    },

    setEngine: function(enginePromise) {
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
    },

    _onHiddenMessage: function(text) {
        if (text.startsWith('(')) {
            // this is a pre-parsed message in SEMPRE format, to be used Sabrina
            // to do buttons and stuff
            // pass it down to the remote if we have one, otherwise ignore it
            if (this._remote) {
                this._remote.handleCommand(null, msg.text).catch(function(e) {
                    console.log('Failed to handle assistant command: ' + e.message);
                }).done();
            }
        } else {
            // try parsing as JSON instead
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

            // ignore everything else
        }
    },

    _onTextMessage: function(text) {
        if (this._remote) {
            this._analyze(text).then(function(analyzed) {
                return this._remote.handleCommand(text, analyzed);
            }.bind(this)).catch(function(e) {
                console.log('Failed to handle assistant command: ' + e.message);
            }).done();
        } else {
            this._handleNoEngine();
        }
    },

    _handleNoEngine: function() {
        if (this._hadEngine)
            this.send("Sorry, your Sabrina died. She will not answer your messages until you restart it.").done();
        else if (this._registering)
            this.send("Sorry, you must complete the registration before you interact with Sabrina.").done();
        else
            this._startRegistration();
    },

    _onPicture: function(hash) {
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
    },

    _onNewMessage: function(msg) {
        if (msg.type === 'text') {
            if (msg.hidden)
                this._onHiddenMessage(msg.text);
            else
                this._onTextMessage(msg.text);
        } else if (msg.type === 'picture') {
            this._onPicture(msg.fullSizeHash);
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

    _startRegistration: function() {
        this._registering = true;
        this.feed.sendText('Welcome to Sabrina!');
        this.feed.sendText('You must complete the registration before continuing');
        this.feed.sendRaw({ type: 'rdl', noun: 'app',
                            displayTitle: "Complete registration",
                            displayText: "Click here to set up username and password",
                            callback: platform.getOrigin() + '/omlet/register',
                            webCallback: platform.getOrigin() + '/user/register' });
    },

    _startWithEngine: function() {
        this._hadEngine = true;
        return this.enginePromise.then(function(engine) {
            this._engine = engine;
            return this._engine.assistant.openConversation(this.feed.feedId, this._user, this);
        }.bind(this)).then(function(conversation) {
            this._remote = conversation;
        }.bind(this));
    },

    start: function(newFeed) {
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
        this._conversationsByAccount = {};
        this._initialFeeds = {};
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

    _addConversationToAccount: function(conv, account) {
        if (!this._conversationsByAccount[account])
            this._conversationsByAccount[account] = [];
        this._conversationsByAccount[account].push(conv);
    },

    _removeConversationFromAccount: function(conv, account) {
        var conversations = this._conversationsByAccount[account] || [];
        var idx = conversations.indexOf(conv);
        if (idx < 0)
            return;
        conversations.splice(idx, 1);
    },

    _makeConversationForAccount: function(feed, user, enginePromise, newFeed) {
        return this._conversations[feed.feedId] = Q.delay(500).then(function() {
            var conv = new AssistantFeed(this._sempre, feed, user, this._messaging, enginePromise);
            return conv.start(newFeed).then(function() {
                this._addConversationToAccount(conv, user.account);
                return conv;
            }.bind(this));
        }.bind(this)).catch(function(e) {
            console.error('Failed to start conversation on feed ' + feed.feedId);
            console.error(e.stack);
        });
    },

    _rejectConversation: function(feedId) {
        if (this._conversations[feedId]) {
            var conv = this._conversations[feedId];
            delete this._conversations[feedId];
            return Q(conv).then(function(conv) {
                this._removeConversationFromAccount(conv, conv.account);
                return conv.stop();
            });
        }
    },

    _makeConversation: function(feedId, newFeed) {
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
    },

    _onFeedAdded: function(feedId) {
        this._makeConversation(feedId, true).done();
    },

    _onFeedChanged: function(feedId) {
        if (this._conversations[feedId])
            return;
        this._makeConversation(feedId, !this._initialFeeds[feedId]).done();
    },

    _onFeedRemoved: function(feedId) {
        var conv = this._conversations[feedId];
        delete this._conversations[feedId];
        if (conv) {
            Q(conv).then(function(conv) {
                this._removeConversationFromAccount(conv, conv.account);
                return conv.stop();
            }.bind(this)).done();
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
                this._initialFeeds[f] = true;
                return this._makeConversation(f, false);
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
        var conversations = this._conversationsByAccount[omletId] || [];
        conversations.forEach(function(conv) {
            conv.destroy().catch(function(e) {
                console.error('Failed to destroy conversation: ' + e.message);
                console.error(e.stack);
                // do not stop or delete the conversation here,
                // it will happen as a side effect of leaving the feed
            }).done();
        });
    },

    addEngine: function(omletId, engine) {
        console.log('Added engine for account ' + omletId);
        var promise = Q(engine);
        this._engines[omletId] = promise;
        var conversations = this._conversationsByAccount[omletId] || [];
        conversations.forEach(function(conv) {
            conv.setEngine(promise);
        });
    },

    removeEngine: function(omletId) {
        var enginePromise = this._engines[omletId];
        delete this._engines[omletId];
        var conversations = this._conversationsByAccount[omletId] || [];
        conversations.forEach(function(conv) {
            conv.setEngine(null);
        });
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
