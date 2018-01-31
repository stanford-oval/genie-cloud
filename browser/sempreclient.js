// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

// This file is meant to be used as an entry point to a browserify
// bundle
// we can use commonjs but no nodejs deps

const URL = 'https://sabrina-nl.stanford.edu';

function httpRequest(url) {
    var req = new XMLHttpRequest();
    req.open('GET', url);
    req.responseType = 'json';
    return Q.Promise(function(callback, errback) {
        req.onerror = function() {
            errback(new Error('Failed to contact SEMPRE server'));
        };
        req.onload = function() {
            callback(req.response);
        }
        req.send();
    });
}

module.exports = class SempreClient {
    constructor(baseUrl, locale) {
        this._baseUrl = baseUrl || URL;
        this._locale = locale || 'en_US';
        this._sessionId = undefined;

        console.log('Using SEMPRE at ' + this._baseUrl + ' with locale ' + this._locale);
    }

    onlineLearn(utterance, json, storeAs) {
        var url = this._baseUrl + '/learn?locale=' + this._locale + '&q=' + encodeURIComponent(utterance)
            + '&sessionId=' + this._sessionId + '&target=' + encodeURIComponent(json);
        if (storeAs)
            url += '&store=' + storeAs;
        return httpRequest(url).then((data) => {
            console.log('Sent "' + utterance + '" to SEMPRE for learning');
            return data;
        }).catch((e) => {
            console.error('Failed to send "' + utterance + '" to SEMPRE for learning: ' + e.message);
        });
    }

    sendUtterance(utterance, expecting, choices) {
        var url = this._baseUrl + '/query?locale=' + this._locale + '&long=1&store=no&q=' + encodeURIComponent(utterance);
        if (this._sessionId)
            url += '&sessionId=' + this._sessionId;
        if (expecting)
            url += '&expect=' + encodeURIComponent(expecting);
        if (choices) {
            choices.forEach(function(c, i) {
                if (c)
                    url += '&choice[' + i + ']=' + encodeURIComponent(c);
            });
        }
        return httpRequest(url).then((parsed) => {
            this._sessionId = parsed.sessionId;

            if (parsed.error)
                throw new Error('Error received from SEMPRE server: ' + parsed.error);

            return parsed.candidates;
        });
    }
}
