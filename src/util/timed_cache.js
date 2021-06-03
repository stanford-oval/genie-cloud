// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>


export default class TimedCache {
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
                }, timeout);
            } else {
                existing.timeout = null;
            }
        } else {
            this._store.set(key, {
                value,
                finalizer,

                timeout: timeout !== null ? setTimeout(() => {
                    this.delete(key);
                }, timeout) : null,
            });
        }
        return this;
    }
}
