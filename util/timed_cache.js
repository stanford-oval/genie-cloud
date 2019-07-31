// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = class TimedCache {
    constructor() {
        this._store = new Map;
    }

    get size() {
        return this._store.size;
    }
    keys() {
        return this._store.keys();
    }
    *values() {
        for (let obj of this._store.values())
            yield obj.value;
    }
    *[Symbol.iterator]() {
        for (let [key, obj] of this._store)
            yield [key, obj.value];
    }
    entries() {
        return this[Symbol.iterator]();
    }

    get(key) {
        const obj = this._store.get(key);
        if (obj === undefined)
            return undefined;
        return obj.value;
    }
    has(key) {
        return this._store.has(key);
    }

    clear() {
        for (let obj of this._store.values()) {
            if (obj.timeout)
                clearTimeout(obj.timeout);
            if (obj.finalizer)
                obj.finalizer(obj.value);
        }
        this._store.clear();
    }

    delete(key) {
        const obj = this._store.get(key);
        if (obj === undefined)
            return false;
        if (obj.timeout)
            clearTimeout(obj.timeout);
        if (obj.finalizer)
            obj.finalizer(obj.value);
        this._store.delete(key);
        return true;
    }
    set(key, value, timeout, finalizer) {
        const existing = this._store.get(key);
        if (existing) {
            if (existing.value !== value) {
                if (existing.finalizer)
                    existing.finalizer(existing.value);
            }
            existing.finalizer = finalizer;

            if (existing.timeout)
                clearTimeout(existing.timeout);
            if (timeout !== null) {
                existing.timeout = setTimeout(() => {
                    this.delete(key);
                });
            } else {
                existing.timeout = null;
            }
        } else {
            this._store.set(key, {
                value,
                finalizer,

                timeout: timeout !== null ? setTimeout(() => {
                    this.delete(key);
                }) : null,
            });
        }
        return this;
    }
};
