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
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    getExamplesByKinds(kinds, isBase) {
        var to = THINGPEDIA_URL + '/api/v3/examples/by-kinds/' + kinds.join(',') + '?locale=' + this.locale
            + '&base=' + (isBase ? '1' : '0');
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }
};
