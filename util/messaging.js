// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Stanford MPortal
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const lang = require('lang');
const events = require('events');

const omclient = require('omclient').client;
// GIANT HACK
const LDProto = require('omclient/lib/ldproto');

const Tp = require('thingpedia');

function oinvoke(object, method) {
    var args = Array.prototype.slice.call(arguments, 2);

    return Q.Promise(function(callback, errback) {
        args.push(callback);
        return object[method].apply(object, args);
    });
}

function arrayEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (var i = 0; i < a.length; i++)
        if (a[i] !== b[i])
            return false;
    return true;
}

const OmletUser = new lang.Class({
    Name: 'OmletUser',
    Extends: Tp.Messaging.User,

    _init: function(id, o) {
        this.id = id;
        this.account = o.account;
        this.name = o.name;
    }
});

const Feed = new lang.Class({
    Name: 'Feed',
    Extends: Tp.Messaging.Feed,

    _init: function(messaging, feedId) {
        this.parent(feedId);

        this._messaging = messaging;
        this._client = messaging.client;
        this._insertListener = null;
        this._db = null;
        this.ownId = null;

        this._lastMessage = 0;
        this._memberList = [];
        this._members = [];
        this.name = null;
    },

    _onInsert: function(o) {
        if (o.serverTimestamp < this._lastMessage)
            return;
        this._lastMessage = o.serverTimestamp;
        this.emit('new-message', o);
        if (this.ownId !== o.senderId)
            this.emit('incoming-message', o);
        else
            this.emit('outgoing-message', o);
    },

    _updateMembers: function() {
        if (arrayEqual(this._memberList, this._feed.members))
            return Q();
        this._memberList = this._feed.members.slice();

        var sortedList = new Array(this._memberList.length);
        for (var i = 0, j = 0; i < this._memberList.length; i++) {
            var id = this._memberList[i];
            if (id === this.ownId) {
                sortedList[0] = id;
            } else {
                sortedList[j+1] = id;
                j++;
            }
        }
        return Q.all(sortedList.map(function(m) {
            return this._messaging.getUserById(m);
        }, this)).then(function(users) {
            this._members = users;

            console.log('New feed members', users.map(function(u) { return u.name; }));
        }.bind(this));
    },

    _updateName: function() {
        if (this._feed.name) {
            this.name = this._feed.name;
        } else if (this._members.length < 2) {
            this.name = "You";
        } else {
            this.name = this._members[1].name;
        }
    },

    update: function(feed) {
        this._feed = feed;

        Q.try(function() {
            if (this.ownId === null) {
                return this._messaging.getOwnId().then(function(ownId) {
                    this.ownId = ownId;
                });
            }
        }.bind(this)).then(function() {
            this._updateMembers();
        }.bind(this)).then(function() {
            this._updateName();
            this.emit('changed');
        }.bind(this)).done();
    },

    _doOpen: function() {
        console.log('Opening feed with ID ' + this.feedId);

        return this._messaging.getOwnId().then(function(ownId) {
            this.ownId = ownId;
            return this._getFeed();
        }.bind(this)).then(function(o) {
            this._feed = o;
            return this._updateMembers();
        }.bind(this)).then(function() {
            this._updateName();
            return oinvoke(this._client.store, 'getFeedObjects', this._client.store.getObjectId(this._feed));
        }.bind(this)).then(function(db) {
            this._db = db;
            this._insertListener = this._onInsert.bind(this);
            this._db._data.on('insert', this._insertListener);
        }.bind(this));
    },

    _doClose: function() {
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

    getMembers: function() {
        return this._members;
    },

    sendText: function(text) {
        return Q.ninvoke(this._client.messaging, '_sendObjToFeed', this._feed, 'text',
                         { text: text });
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

    sendItem: function(item) {
        var silent = true;
        return Q.ninvoke(this._client.messaging, '_sendObjToFeed', this._feed, 'text',
                         { text: JSON.stringify(item), silent: silent,
                           hidden: silent });
    },

    sendRaw: function(rawItem) {
        return Q.ninvoke(this._client.messaging, '_sendObjToFeed', this._feed, rawItem.type,
                         rawItem);
    }
});

module.exports = new lang.Class({
    Name: 'Messaging',
    Extends: Tp.Messaging,

    _init: function(client) {
        this.parent();

        this.client = client;
        this._feeds = {};
    },

    _onFeedRemoved: function(o) {
        this.emit('feed-removed', o.identifier);
        delete this._feeds[o.identifier];
    },

    _onFeedChanged: function(o) {
        var feed = this._feeds[o.identifier];
        if (feed)
            feed.update(o);
        this.emit('feed-changed', o.identifier);
    },

    _onFeedAdded: function(o) {
        this.emit('feed-added', o.identifier);
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
            this._feedAddedListener = this._onFeedAdded.bind(this);
            db._data.on('delete', this._feedRemovedListener);
            db._data.on('update', this._feedChangedListener);
            db._data.on('insert', this._feedAddedListener);
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
            db._data.removeListener('insert', this._feedAddedListener);
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

    leaveFeed: function(feedId) {
        return oinvoke(this.client.store, 'getFeeds').then(function(db) {
            return oinvoke(db, 'getObjectByKey', feedId).then(function(feed) {
                var ldFeed = this.client.feed.getLDFeed(feed);
                var account = this.client.account;
                var req = new LDProto.LDRemoveMemberRequest();
                req.Feed = ldFeed;
                req.Member = account;
                return Q.Promise(function(callback, errback) {
                    return this.client._msgCall(req, function(err, resp) {
                        if (err)
                            errback(err);
                        else
                            callback();
                    }.bind(this));
                }.bind(this)).then(function() {
                    // GIANT GIANT GIANT HACK
                    // omclient does not process feed membership changes
                    // in a sensible manner
                    // so we just delete the feed manually here
                    db._data.remove(feed);
                });
            }.bind(this));
        }.bind(this));
    }
});

