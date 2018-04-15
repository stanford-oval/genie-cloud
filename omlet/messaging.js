// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

// GIANT HACK
const LDRemoveMemberRequest = require('omlib/src/longdan/ldproto/LDRemoveMemberRequest');

const Tp = require('thingpedia');

function oinvoke(object, method) {
    var args = Array.prototype.slice.call(arguments, 2);

    return new Promise((callback, errback) => {
        args.push(callback);
        return object[method].apply(object, args);
    });
}

function arrayEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
}

class OmletUser {
    constructor(id, o) {
        this.id = id;
        this.account = o.account;
        this.name = o.name;
    }
}

class Feed extends Tp.Messaging.Feed {
    constructor(messaging, feedId) {
        super(feedId);

        this._messaging = messaging;
        this._client = messaging.client;
        this._insertListener = null;
        this._db = null;
        this.ownId = null;

        this._lastMessage = 0;
        this._memberList = [];
        this._members = [];
        this.name = null;
    }

    _onInsert(o) {
        if (o.serverTimestamp < this._lastMessage)
            return;
        this._lastMessage = o.serverTimestamp;
        this.emit('new-message', o);
        if (this.ownId !== o.senderId)
            this.emit('incoming-message', o);
        else
            this.emit('outgoing-message', o);
    }

    _updateMembers() {
        if (arrayEqual(this._memberList, this._feed.members))
            return Promise.resolve();
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
        return Promise.all(sortedList.map((m) => {
            return this._messaging.getUserById(m);
        })).then((users) => {
            this._members = users;
        });
    }

    _updateName() {
        if (this._feed.name)
            this.name = this._feed.name;
        else if (this._members.length < 2)
            this.name = "You";
        else
            this.name = this._members[1].name;
    }

    update(feed) {
        this._feed = feed;

        Promise.resolve().then(() => {
            if (this.ownId === null) {
                return this._messaging.getOwnId().then((ownId) => {
                    this.ownId = ownId;
                });
            } else {
                return Promise.resolve();
            }
        }).then(() => {
            return this._updateMembers();
        }).then(() => {
            this._updateName();
            this.emit('changed');
        });
    }

    _doOpen() {
        return this._messaging.getOwnId().then((ownId) => {
            this.ownId = ownId;
            return this._getFeed();
        }).then((o) => {
            this._feed = o;
            return this._updateMembers();
        }).then(() => {
            this._updateName();
            return oinvoke(this._client.store, 'getFeedObjects', this._client.store.getObjectId(this._feed));
        }).then((db) => {
            this._db = db;
            this._insertListener = this._onInsert.bind(this);
            this._db._data.on('insert', this._insertListener);
        });
    }

    _doClose() {
        if (this._insertListener)
            this._db._data.removeListener('insert', this._insertListener);
        this._insertListener = null;
        this._messaging.feedClosed(this.feedId);

        return Promise.resolve();
    }

    _getFeed() {
        return oinvoke(this._client.store, 'getFeeds').then((db) => {
            return oinvoke(db, 'getObjectByKey', this.feedId);
        });
    }

    getMembers() {
        return this._members;
    }

    sendText(text) {
        return Q.ninvoke(this._client._ldClient.messaging, '_sendObjToFeed', this._feed, 'text',
                         { text: text });
    }

    sendPicture(url) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) {
                return Tp.Helpers.Http.get(url, { raw: true }).then(([data, contentType]) => {
                    return Q.ninvoke(this._client._ldClient.messaging, '_pictureObjFromBytes', data, contentType);
                }).then(([objType, obj]) => {
                    return Q.ninvoke(this._client._ldClient.messaging, '_sendObjToFeed',
                                     this._feed, objType, obj);
                });
            } else {
                throw new Error('Sending pictures by non-http url is not implemented, sorry');
            }
        } else if (Buffer.isBuffer(url)) {
            return Q.ninvoke(this._client.messaging, '_pictureObjFromBytes', url)
                .then(([objType, obj]) => {
                    return Q.ninvoke(this._client.messaging, '_sendObjToFeed',
                                     this._feed, objType, obj);
                });
        } else {
            throw new TypeError('Invalid type for call to sendPicture, must be string or buffer');
        }
    }

    sendItem(item) {
        var silent = true;
        return Q.ninvoke(this._client._ldClient.messaging, '_sendObjToFeed', this._feed, 'text',
                         { text: JSON.stringify(item), silent: silent,
                           hidden: silent });
    }

    sendRaw(rawItem) {
        return Q.ninvoke(this._client._ldClient.messaging, '_sendObjToFeed', this._feed, rawItem.type,
                         rawItem);
    }
}

module.exports = class Messaging extends Tp.Messaging {
    constructor(client) {
        super();
        this.client = client;
        this._feeds = {};
    }

    get account() {
        return this.client.auth.getAccount();
    }

    _onFeedRemoved(o) {
        this.emit('feed-removed', o.identifier);
        delete this._feeds[o.identifier];
    }

    _onFeedChanged(o) {
        var feed = this._feeds[o.identifier];
        if (feed)
            feed.update(o);
        this.emit('feed-changed', o.identifier);
    }

    _onFeedAdded(o) {
        this.emit('feed-added', o.identifier);
    }

    feedClosed(identifier) {
        delete this._feeds[identifier];
    }

    getFeed(feedId) {
        if (feedId in this._feeds)
            return this._feeds[feedId];

        return this._feeds[feedId] = new Feed(this, feedId);
    }

    start() {
        return oinvoke(this.client.store, 'getFeeds').then((db) => {
            this._feedRemovedListener = this._onFeedRemoved.bind(this);
            this._feedChangedListener = this._onFeedChanged.bind(this);
            this._feedAddedListener = this._onFeedAdded.bind(this);
            db._data.on('delete', this._feedRemovedListener);
            db._data.on('update', this._feedChangedListener);
            db._data.on('insert', this._feedAddedListener);
        }).then(() => {
            return this.getOwnId();
        }).then((ownId) => {
            this.ownId = ownId;
        });
    }

    stop() {
        return oinvoke(this.client.store, 'getFeeds').then((db) => {
            db._data.removeListener('delete', this._feedRemovedListener);
            db._data.removeListener('update', this._feedChangedListener);
            db._data.removeListener('insert', this._feedAddedListener);
        });
    }

    getOwnId() {
        return oinvoke(this.client.store, 'getAccounts').then((db) => {
            return db._data.find({ owned: true }).map((o) => {
                return this.client.store.getObjectId(o);
            })[0];
        });
    }

    getUserById(id) {
        return oinvoke(this.client.store, 'getAccounts').then((db) => {
            return oinvoke(db, 'getObjectById', id).then((o) => {
                if (!o)
                    return new OmletUser(null, { name: '', account: '' });
                return new OmletUser(this.client.store.getObjectId(o), o);
            });
        });
    }

    getFeedList() {
        return oinvoke(this.client.store, 'getFeeds').then((db) => {
            const data = db._data.find();
            return data.map((d) => {
                return d.identifier;
            });
        });
    }

    createFeed() {
        return Q.ninvoke(this.client.feeds, 'createFeed').then((feed) => {
            return new Feed(this, feed.identifier);
        });
    }

    addAccountToContacts(contactId) {
        return oinvoke(this.client._ldClient.identity, '_addAccountToContacts', contactId);
    }

    getFeedWithContact(contactId) {
        return Q.ninvoke(this.client.feeds, 'getOrCreateFeedWithAccounts', [contactId]).then(([feed, existing]) => {
            if (existing)
                console.log('Reusing feed ' + feed.identifier + ' with ' + contactId);
            else
                console.log('Created feed ' + feed.identifier + ' with ' + contactId);
            return this.getFeed(feed.identifier);
        });
    }

    leaveFeed(feedId) {
        return oinvoke(this.client.store, 'getFeeds').then((db) => {
            return oinvoke(db, 'getObjectByKey', feedId).then((feed) => {
                const ldFeed = this.client._ldClient.feed.getLDFeed(feed);
                const account = this.client.auth.getAccount();
                const req = new LDRemoveMemberRequest();
                req.Feed = ldFeed;
                req.Member = account;
                return new Promise((callback, errback) => {
                    return this.client._ldClient._msg.call(req, (err, resp) => {
                        if (err)
                            errback(err);
                        else
                            callback();
                    });
                }).then(() => {
                    // GIANT GIANT GIANT HACK
                    // omclient does not process feed membership changes
                    // in a sensible manner
                    // so we just delete the feed manually here
                    db._data.remove(feed);
                });
            });
        });
    }
};