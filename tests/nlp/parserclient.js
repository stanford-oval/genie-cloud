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
const qs = require('qs');

module.exports = class ParserClient {
    constructor(baseUrl, locale) {
        this._locale = locale || 'en_US';
        if (!baseUrl)
            throw new Error('wat');
        this._baseUrl = baseUrl + '/' + this._locale;

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

    async tokenize(utterance, contextEntities) {
        const data = {
            q: utterance,
        };

        let response;
        if (contextEntities !== undefined) {
            data.entities = contextEntities;

            response = await Tp.Helpers.Http.post(`${this._baseUrl}/tokenize`, JSON.stringify(data), {
                dataContentType: 'application/json' //'
            });
        } else {
            let url = `${this._baseUrl}/tokenize?${qs.stringify(data)}`;

            response = await Tp.Helpers.Http.get(url);
        }
        const parsed = JSON.parse(response);

        if (parsed.error)
            throw new Error('Error received from Genie-Parser server: ' + parsed.error);

        return parsed;
    }

    async sendUtterance(utterance, context, expecting, choices) {
        const store = 'no';
        const data = {
            q: utterance,
            store: store,
            thingtalk_version: ThingTalk.version,
        };
        if (expecting)
            data.expect = String(expecting);

        if (choices)
            data.choices = choices.map((c) => c.title);

        let response;
        if (context) {
            data.context = context.code;
            data.entities = context.entities;

            response = await Tp.Helpers.Http.post(`${this._baseUrl}/query`, JSON.stringify(data), {
                dataContentType: 'application/json' //'
            });
        } else {
            let url = `${this._baseUrl}/query?${qs.stringify(data)}`;

            response = await Tp.Helpers.Http.get(url);
        }

        const  parsed = JSON.parse(response);

        if (parsed.error)
            throw new Error('Error received from Almond-NNParser server: ' + parsed.error);

        return parsed;
    }
};
