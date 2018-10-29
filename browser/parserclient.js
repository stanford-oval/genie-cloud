// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');

const URL = 'https://almond-nl.stanford.edu';

module.exports = class ParserClient {
    constructor(baseUrl, locale) {
        this._locale = locale || 'en_US';
        this._baseUrl = (baseUrl || URL) + '/' + this._locale;

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
                thingtalk_version: ThingTalk.version
            }
        })).catch((e) => {
            // errors are useless because the browser blocks the response on error (due to
            // missing Access-Control-Allow-Origin)
            throw new Error('Failed to store the new sentence. You might need to wait until the natural language is fully trained.');
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
                thingtalk_version: ThingTalk.version
            }
        })).then((parsed) => {
            if (parsed.error)
                throw new Error('Error received from Almond natural language server: ' + parsed.error);

            return parsed;
        });
    }
};
