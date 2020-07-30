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

const ThingTalk = require('thingtalk');

const THINGPEDIA_URL = '/thingpedia';

function httpRequest(url) {
    return Promise.resolve($.ajax(url));
}

module.exports = class ThingpediaClientBrowser {
    constructor(developerKey, locale) {
        this.developerKey = developerKey;
        this.locale = locale || 'en_US';
    }

    _simpleRequest(to, noAppend) {
        if (!noAppend) {
            to += '?locale=' + this.locale;
            to += '&thingtalk_version=' + ThingTalk.version;
            if (this.developerKey)
                to += '&developer_key=' + this.developerKey;
        }

        return httpRequest(to);
    }

    getDeviceCode(id) {
        var to = THINGPEDIA_URL + '/api/v3/devices/code/' + id;
        return this._simpleRequest(to);
    }

    getSchemas(kinds, withMetadata) {
        var to = THINGPEDIA_URL + '/api/v3/schema/' + kinds.join(',');
        to += '?locale=' + this.locale;
        to += '&thingtalk_version=' + ThingTalk.version;
        if (withMetadata)
            to += '&meta=1';
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    getDeviceFactories(klass) {
        var to = THINGPEDIA_URL + '/api/v3/devices/setup';
        if (klass) {
            to += '?class=' + klass;
            to += '&thingtalk_version=' + ThingTalk.version;
            if (this.developerKey)
                to += '&developer_key=' + this.developerKey;
            return this._simpleRequest(to, true);
        } else {
            return this._simpleRequest(to);
        }
    }

    getDeviceSetup(kinds) {
        var to = THINGPEDIA_URL + '/api/v3/devices/setup/' + kinds.join(',');
        return this._simpleRequest(to);
    }

    getExamplesByKey(key, isBase) {
        var to = THINGPEDIA_URL + '/api/v3/examples/search?locale=' + this.locale + '&q=' + encodeURIComponent(key)
            + '&base=' + (isBase ? '1' : '0');
        to += '&thingtalk_version=' + ThingTalk.version;
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    getExamplesByKinds(kinds, isBase) {
        var to = THINGPEDIA_URL + '/api/v3/examples/by-kinds/' + kinds.join(',') + '?locale=' + this.locale
            + '&base=' + (isBase ? '1' : '0');
        to += '&thingtalk_version=' + ThingTalk.version;
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }
};
