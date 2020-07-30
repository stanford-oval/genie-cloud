// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

const URL = 'https://almond-nl.stanford.edu';

module.exports = class ParserClient {
    constructor(baseUrl, locale, developerKey) {
        this._locale = locale || 'en_US';
        this._baseUrl = (baseUrl || URL) + '/' + this._locale;
        this._developerKey = developerKey;

        console.log('Using Almond-NNParser at ' + this._baseUrl);
    }

    onlineLearn(utterance, code, store = 'automatic', user = null) {
        if (Array.isArray(code))
            code = code.join(' ');
        if (typeof code !== 'string')
            throw new TypeError('Invalid code parameter to onlineLearn');
        return Promise.resolve($.ajax(this._baseUrl + '/learn', {
            method: 'POST',
            data: {
                q: utterance,
                target: code,
                store,
                owner: user,
                thingtalk_version: ThingTalk.version,
                developer_key: this._developerKey
            }
        })).catch((e) => {
            if ('responseJSON' in e && 'error' in e.responseJSON) {
                if (e.responseJSON.error === 'Missing owner for commandpedia command')
                    throw new Error('You need to log in to add new command.');
                throw new Error('Failed to store the new sentence: ' + e.responseJSON.error);
            } else {
                throw e;
            }

        });
    }

    tokenize(utterance) {
        let url = this._baseUrl + '/tokenize';
        return Promise.resolve($.ajax(url, { data: { q: utterance } })).then((parsed) => {
            if (parsed.error)
                throw new Error('Error received from Almond natural language server: ' + parsed.error);

            return parsed;
        });
    }

    sendUtterance(utterance, limit = -1) {
        let url = this._baseUrl + '/query';
        return Promise.resolve($.ajax(url, {
            data: {
                q: utterance,
                limit: limit,
                store:'yes',
                thingtalk_version: ThingTalk.version,
                developer_key: this._developerKey
            }
        })).then((parsed) => {
            if (parsed.error)
                throw new Error('Error received from Almond natural language server: ' + parsed.error);

            return parsed;
        });
    }
};
