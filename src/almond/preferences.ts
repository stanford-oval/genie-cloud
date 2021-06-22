// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2021 The Board of Trustees of the Leland Stanford Junior University
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

import * as Tp from 'thingpedia';

/**
 * An implementation of the {@link Tp.Preferences} interface that
 * interfaces with the DB proxy to store preferences in MySQL.
 */
export default class SQLPreferences extends Tp.Preferences {
    private _baseUrl : string;
    private _auth : string;
    private _data : Record<string, unknown>;

    constructor(baseUrl : string, accessToken : string) {
        super();

        this._baseUrl = baseUrl;
        this._auth = `Bearer ${accessToken}`;
        this._data = {};
    }

    async init() {
        // read all the preferences and cache them locally
        // this allows clients to read the data synchronously,
        // which the interface requires

        const resp = await Tp.Helpers.Http.get(`${this._baseUrl}/localtable/user_preference`, { auth: this._auth });
        const data = JSON.parse(resp)['data'];

        for (const row of data)
            this._data[row.uniqueId] = JSON.parse(row.value);
    }

    private _getObjectUrl(uniqueId : string) {
        return `${this._baseUrl}/localtable/user_preference/${encodeURIComponent(uniqueId)}`;
    }

    private async _flush(key : string) {
        try {
            if (this._data[key] === undefined) {
                await Tp.Helpers.Http.request(this._getObjectUrl(key), 'DELETE', '', { auth: this._auth });
            } else {
                // two layers of JSON.stringify: one is for HTTP transport and one is to put in the actual database
                await Tp.Helpers.Http.post(this._getObjectUrl(key), JSON.stringify({ value: JSON.stringify(this._data[key]) }), {
                    dataContentType: 'application/json',
                    auth: this._auth,
                });
            }
        } catch(e) {
            console.error(`Failed to flush preference update to database: ${e.message}`);
        }
    }

    get(key : string) : unknown {
        return this._data[key];
    }

    set<T>(key : string, value : T) : T {
        this._data[key] = value;
        this._flush(key);
        return value;
    }

    delete(key : string) {
        delete this._data[key];
        this._flush(key);
    }

    changed(key : string) {
        this._flush(key);
    }
}
