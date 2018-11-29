// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = class PersistentSet {
    constructor(key) {
        this._key = key;
        this._store = new Set(JSON.parse(window.localStorage.getItem(key) || '[]'));
    }

    has(id) {
        return this._store.has(id);
    }

    add(id) {
        if (this._store.has(id))
            return false;
        this._store.add(id);
        window.localStorage.setItem(this._key, JSON.stringify(Array.from(this._store)));
        return true;
    }

    delete(id) {
        if (!this._store.has(id))
            return false;
        this._store.delete(id);
        window.localStorage.setItem(this._key, JSON.stringify(Array.from(this._store)));
        return true;
    }
};
