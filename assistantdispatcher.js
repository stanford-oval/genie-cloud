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

function oinvoke(object, method) {
    var args = Array.prototype.slice.call(arguments, 2);

    return Q.Promise(function(callback, errback) {
        args.push(callback);
        return object[method].apply(object, args);
    });
}

const Feed = new lang.Class({
    Name: 'Feed',
    Extends: events.EventEmitter,

    _init: function(messaging, feedId) {
        events.EventEmitter.call(this);

        this.feedId = feedId;
        this._messaging = messaging;
        this._client = messaging.client;
        this._insertListener = null;
        this._db = null;
    },

    _onInsert: function(o) {
        this.emit('new-message', o);
        if (this._messaging.ownId !== o.senderId)
            this.emit('incoming-message', o);
        else
            this.emit('outgoing-message', o);
    },

    update: function(feed) {
        this._feed = feed;
    },

    open: function() {
        console.log('Opening feed with ID ' + this.feedId);

        return this._getFeed().then(function(o) {
            this._feed = o;
            return oinvoke(this._client.store, 'getFeedObjects', this._client.store.getObjectId(this._feed));
        }.bind(this)).then(function(db) {
            this._db = db;
            this._insertListener = this._onInsert.bind(this);
            this._db._data.on('insert', this._insertListener);
        }.bind(this));
    },

    close: function() {
        if (this._insertListener)
            this._db._data.removeListener('insert', this._insertListener);
        this._insertListener = null;
        this._messaging.feedClosed(this.feedId);

        return Q();
    },

    _getFeed: function() {
        return oinvoke(this._client.store, 'getFeeds').then(function(db) {
            return oinvoke(db, 'getObjectByKey', this.feedId);
        }.bind(this)).then(function(o) {
            return o;
        }.bind(this));
    },

    sendText: function(text) {
        return Q.ninvoke(this._client.messaging, '_sendObjToFeedImmediate', this._feed, 'text',
                         { text: text });
    },

    sendItem: function(item) {
        var silent = true;
        return Q.ninvoke(this._client.messaging, '_sendObjToFeedImmediate', this._feed, 'text',
                         { text: JSON.stringify(item), silent: silent,
                           hidden: silent });
    },

    sendRaw: function(rawItem) {
        return Q.ninvoke(this._client.messaging, '_sendObjToFeedImmediate', this._feed, rawItem.type,
                         rawItem);
    },

    sendPicture: function(url) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) {
                return Tp.Helpers.Http.get(url, { raw: true }).spread(function(data, contentType) {
                    return Q.ninvoke(this._client.messaging, '_pictureObjFromBytes', data, contentType);
                }.bind(this)).spread(function(objType, obj) {
                    return Q.ninvoke(this._client.messaging, '_sendObjToFeed',
                                     this._feed, objType, obj);
                }.bind(this));
            } else {
                throw new Error('Sending pictures by non-http url is not implemented, sorry');
            }
        } else if (Buffer.isBuffer(url)) {
            return Q.ninvoke(this._client.messaging, '_pictureObjFromBytes', url)
                .spread(function(objType, obj) {
                    return Q.ninvoke(this._client.messaging, '_sendObjToFeed',
                                     this._feed, objType, obj);
                }.bind(this));
        } else {
            throw new TypeError('Invalid type for call to sendPicture, must be string or buffer');
        }
    },
});

const Messaging = new lang.Class({
    Name: 'Messaging',

    _init: function(client) {
        this.client = client;
        this._feeds = {};
    },

    _onFeedRemoved: function(o) {
        delete this._feeds[o.identifier];
    },

    _onFeedChanged: function(o) {
        var feed = this._feeds[o.identifier];
        if (feed)
            feed.update(o);
    },

    feedClosed: function(identifier) {
        delete this._feeds[identifier];
    },

    getFeed: function(feedId) {
        if (feedId in this._feeds)
            return this._feeds[feedId];

        return this._feeds[feedId] = new Feed(this, feedId);
    },

    start: function() {
        return oinvoke(this.client.store, 'getFeeds').then(function(db) {
            this._feedRemovedListener = this._onFeedRemoved.bind(this);
            this._feedChangedListener = this._onFeedChanged.bind(this);
            db._data.on('delete', this._feedRemovedListener);
            db._data.on('update', this._feedChangedListener);
        }.bind(this)).then(function() {
            return this.getOwnId();
        }.bind(this)).then(function(ownId) {
            this.ownId = ownId;
        }.bind(this));
    },

    stop: function() {
        return oinvoke(this.client.store, 'getFeeds').then(function(db) {
            db._data.removeListener('delete', this._feedRemovedListener);
            db._data.removeListener('update', this._feedChangedListener);
        }.bind(this));
    },

    getOwnId: function() {
        return oinvoke(this.client.store, 'getAccounts').then(function(db) {
            return db._data.find({ owned: true }).map(function(o) {
                return this.client.store.getObjectId(o);
            }, this)[0];
        }.bind(this));
    },

    getUserById: function(id) {
        return oinvoke(this.client.store, 'getAccounts').then(function(db) {
            return oinvoke(db, 'getObjectById', id).then(function(o) {
                return new OmletUser(this.client.store.getObjectId(o), o);
            }.bind(this));
        }.bind(this));
    },

    getAccountById: function(id) {
        return oinvoke(this.client.store, 'getAccounts').then(function(db) {
            return oinvoke(db, 'getObjectById', id).then(function(o) {
                return o.account;
            });
        }.bind(this));
    },

    getAccountNameById: function(id) {
        return oinvoke(this.client.store, 'getAccounts').then(function(db) {
            return oinvoke(db, 'getObjectById', id).then(function(o) {
                return o.name;
            });
        }.bind(this));
    },

    getFeedList: function() {
        return oinvoke(this.client.store, 'getFeeds').then(function(db) {
            var data = db._data.find();
            return data.map(function(d) {
                return d.identifier;
            });
        }.bind(this));
    },

    createFeed: function() {
        return Q.ninvoke(this.client.feed, 'createFeed').then(function(feed) {
            return new OmletFeed(this, feed.identifier);
        }.bind(this));
    },

    addAccountToContacts: function(contactId) {
        return oinvoke(this.client.identity, '_addAccountToContacts', contactId);
    },

    getFeedWithContact: function(contactId) {
        return Q.ninvoke(this.client.feed, 'getOrCreateFeedWithMembers', [contactId]).spread(function(feed, existing) {
            if (existing)
                console.log('Reusing feed ' + feed.identifier + ' with ' + contactId);
            else
                console.log('Created feed ' + feed.identifier + ' with ' + contactId);
            return this.getFeed(feed.identifier);
        }.bind(this));
    },
});

const AssistantFeed = new lang.Class({
    Name: 'AssistantFeed',
    $rpcMethods: ['send', 'analyze', 'sendPicture'],

    _init: function(sempre, feed, client, engine) {
        this._sempre = sempre;
        this._feed = feed;
        this._client = client;
        this._remote = engine.assistant;
        this._newMessageListener = this._onNewMessage.bind(this);
    },

    _onNewMessage: function(msg) {
        if (msg.type === 'text') {
            if (msg.hidden) // hidden messages are used by ThingTalk feed-shared keywords, ignore them
                return;
            this._remote.handleCommand(msg.text).catch(function(e) {
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
        return this._feed.sendText(msg);
    },

    sendPicture: function(url) {
        return this._feed.sendPicture(url);
    },

    analyze: function(utterance) {
        return this._sempre.sendUtterance(this._feed.feedId, utterance);
    },

    start: function() {
        this._feed.on('incoming-message', this._newMessageListener);
        this._remote.setDelegate(this).done();
        return this._feed.open();
    },

    stop: function() {
        this._feed.removeListener('incoming-message', this._newMessageListener);
        this._remote.setDelegate(null).done();
        return this._feed.close();
    }
});

module.exports = new lang.Class({
    Name: 'AssistantDispatcher',

    _init: function() {
        instance_ = this;

        this._engines = {};
        this._sempre = new Sempre(false);

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

    start: function() {
        if (!this._client)
            return;

        this._client.enable();
        this._sempre.start();
        this._messaging = new Messaging(this._client);
        return this._messaging.start().then(function() {
            for (var userId in this._engines) {
                var obj = this._engines[userId];
                if (obj.feed !== null)
                    continue;

                this._startEngine(obj, false);
            }
        }.bind(this));
    },

    stop: function() {
        if (!this._client)
            return;
        this._client.disable();
        this._sempre.stop();

        for (var userId in this._engines) {
            var obj = this._engines[userId];
            if (obj.feed === null)
                continue;

            obj.feed.stop().done();
        }
    },

    _startEngine: function(obj, firstTime) {
        var feed = this._messaging.getFeed(obj.feedId);
        obj.feed = new AssistantFeed(this._sempre, feed, this._messaging.client, obj.engine);
        obj.feed.start().done();
    },

    createFeedForEngine: function(userId, engine, contactId) {
        return this._messaging.addAccountToContacts(contactId)
            .then(function() {
                return this._messaging.getFeedWithContact(contactId);
            }.bind(this))
            .then(function(feed) {
                this.addEngine(userId, engine, feed.feedId);
                return feed.feedId;
            }.bind(this));
    },

    addEngine: function(userId, engine, feedId) {
        var obj = {
            engine: engine,
            feedId: feedId,
            feed: null,
        };
        if (this._engines[userId]) {
            var old = this._engines[userId];
            if (old.feed !== null)
                old.feed.stop().done();
        }
        this._engines[userId] = obj;

        if (this._client)
            this._startEngine(obj);
    },

    removeEngine: function(userId) {
        var obj = this._engines[userId];
        if (!obj)
            return;

        if (obj.feed !== null)
            obj.feed.stop().done();

        delete this._engines[userId];
    },

    getUserFeed: function(userId) {
        var obj = this._engines[userId];
        if (!obj)
            throw new Error('User ' + userId + ' has no assistant');

        return obj.feed;
    },

    getAllFeeds: function() {
        return Object.keys(this._engines).map(function(userId) {
            return this._engines[userId].feed;
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
