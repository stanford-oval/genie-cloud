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
const Tp = require('thingpedia');
const qs = require('querystring');

const URL = 'https://almond-nl.stanford.edu';

module.exports = class ParserClient {
    constructor(baseUrl, locale) {
        this._locale = locale || 'en_US';
        this._baseUrl = (baseUrl || URL) + '/' + this._locale;

        console.log('Using Almond-NNParser at ' + this._baseUrl);
    }

    onlineLearn(utterance, code, store = 'automatic') {
        const data = qs.stringify({
            q: utterance,
            target: code.join(' '),
            store: store,
            thingtalk_version: ThingTalk.version,
        });
        return Tp.Helpers.Http.post(this._baseUrl + '/learn', data, { dataContentType: 'application/x-www-form-urlencoded' }).then(() => {
            console.log(`Sent "${utterance}" to Almond-NNParser for learning`);
        });
    }

    sendUtterance(utterance, expecting, choices) {
        const store = 'no';
        const data = {
            q: utterance,
            store: store,
            thingtalk_version: ThingTalk.version,
        };
        if (expecting)
            data.expect = String(expecting);

        let url = `${this._baseUrl}/query?${qs.stringify(data)}`;

        // we need to do this one by hand because of the peculiar encoding
        // of the keys (we must not escape [ and ])
        if (choices) {
            choices.forEach((c, i) => {
                if (c)
                    url += `&choices[${i}]=${encodeURIComponent(c.title)}`;
            });
        }

        return Tp.Helpers.Http.get(url).then((data) => {
            var parsed = JSON.parse(data);

            if (parsed.error)
                throw new Error('Error received from Almond-NNParser server: ' + parsed.error);

            return parsed;
        });
    }
};
