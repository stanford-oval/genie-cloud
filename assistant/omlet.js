// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const fs = require('fs');
const Omlib = require('omlib');

const Messaging = require('./messaging');

const API_KEY = '00109b1ea59d9f46d571834870f0168b5ed20005871d8752ff';
const API_SECRET = 'bccb852856c462e748193d6211c730199d62adcf0ba963416fcc715a2db4d76f';

class OmletStateStorage {
    constructor() {
        this._prefs = platform.getSharedPreferences();
        this._storage = this._prefs.get('assistant');
        if (this._storage === undefined)
            this._prefs.set('assistant', this._storage = {});
    }

    key(idx) {
        return Object.keys(this._storage)[idx];
    }
    getItem(key) {
        return this._storage[key];
    }
    setItem(key, value) {
        this._storage[key] = value;
        this._prefs.changed();
    }
    removeItem(key) {
        delete this._storage[key];
        this._prefs.changed();
    }
    clear() {
        this._storage = {};
        this._prefs.changed();
    }
}

function safeMkdirSync(dir) {
    try {
        fs.mkdirSync(dir);
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
}

function makeOmletClient() {
    var dbpath = platform.getWritableDir() + '/omlet';
    safeMkdirSync(dbpath);
    var client = new Omlib({ instance: '',
                             storage: new OmletStateStorage(),
                             storagePath: dbpath,
                             sync: false,
                             apiKey: { Id: API_KEY, Secret: API_SECRET } });
    client._ldClient.longdanMessageConsumer.DEBUG = false;
    return client;
}

module.exports = makeOmletClient;
