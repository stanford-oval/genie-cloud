// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
