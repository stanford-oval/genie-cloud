// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const http = require('http');
const https = require('https');
const Url = require('url');

const URL = process.env.SEMPRE_URL || 'https://pepperjack.stanford.edu';

function getModule(parsed) {
    if (parsed.protocol === 'https:')
        return https;
    else
        return http;
}

function httpRequest(url) {
    var parsed = Url.parse(url);
    parsed.method = 'GET';

    return Q.Promise(function(callback, errback) {
        var req = getModule(parsed).request(parsed, function(res) {
            if (res.statusCode == 302 ||
                res.statusCode == 301 ||
                res.statusCode == 303) {
                res.resume();
                httpRequest(res.headers['location']).then(callback, errback);
                return;
            }
            if (res.statusCode >= 300) {
                var data = '';
                res.setEncoding('utf8');
                res.on('data', function(chunk) {
                    data += chunk;
                });
                res.on('end', function() {
                    console.log('HTTP request failed: ' + data);
                    errback(new Error('Unexpected HTTP error ' + res.statusCode));
                });
                return;
            }

            var data = '';
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                data += chunk;
            });
            res.on('end', function() {
                callback(data);
            });
        });
        req.on('error', function(err) {
            errback(err);
        });
        req.end();
    });
}

module.exports = class SempreClient {
    constructor(baseUrl, locale) {
        this._baseUrl = baseUrl || URL;
        this._locale = locale || 'en_US';
        this._sessionId = undefined;

        console.log('Using SEMPRE at ' + this._baseUrl + ' with locale ' + this._locale);
    }

    onlineLearn(utterance, json) {
        var url = this._baseUrl + '/learn?locale=' + this._locale + '&q=' + encodeURIComponent(utterance)
            + '&sessionId=' + this._sessionId + '&target=' + encodeURIComponent(json);
        return httpRequest(url).then(() => {
            console.log('Sent "' + utterance + '" to SEMPRE for learning');
        }).catch((e) => {
            console.error('Failed to send "' + utterance + '" to SEMPRE for learning: ' + e.message);
        });
    }

    sendUtterance(utterance, expecting, choices, long) {
        var url = this._baseUrl + '/query?locale=' + this._locale + '&' + (long ? 'long=1' : 'limit=20') + '&q=' + encodeURIComponent(utterance);
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
        return httpRequest(url).then((data) => {
            var parsed = JSON.parse(data);
            this._sessionId = parsed.sessionId;

            if (parsed.error)
                throw new Error('Error received from SEMPRE server: ' + parsed.error);

            return parsed.candidates;
        });
    }
}
