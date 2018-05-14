// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details

"use strict";

const path = require('path');
const https = require('https');
const Url = require('url');
const Q = require('q');
const fs = require('fs');
const colorExtractor = require('img-color-extractor');
const db = require('../util/db');
const deviceModel = require('../model/device');

const TARGET_JSON = path.resolve(path.dirname(module.filename), '../public/friendhub/backgrounds/color_schemes.json');

const defaultsOptions = {
    background: '#FFFFFF',
    alphaMin: 0,
    dist: 100,
    greyVa: -1,
};

const ColorScheme = require('color-scheme');
const scheme = new ColorScheme;

function makeColorScheme(stream) {
    return colorExtractor.extract(stream, defaultsOptions).then((colors_dominant) => {
        if(colors_dominant[0].color === "#ffffff")
            colors_dominant.shift();
        
        colors_dominant = colors_dominant.map((color) => color.color);
        let color_dominant = colors_dominant[0];
        color_dominant = color_dominant.replace(/^#/, '');


        let colors_palette_default = scheme.from_hex(color_dominant)
            .scheme('contrast')
            .variation('default')
            .colors()
            .map((color) => "#" + color);

        let colors_palette_light = scheme.from_hex(color_dominant)
            .scheme('contrast')
            .variation('light')
            .colors()
            .map((color) => "#" + color);

        return [colors_dominant, colors_palette_default, colors_palette_light];
    });
}

function httpRequest(url) {
    let options = Url.parse(url);
    return new Q.Promise((callback, errback) => {
        let httpcallback = (res) => {
            res.on('error', errback);
            if (res.statusCode !== 200) {
                let e = new Error('Unexpected HTTP error ' + res.statusCode);
                e.code = res.statusCode;
                res.resume();
                errback(e);
                return;
            }
            callback(res);
        };
        https.get(options, httpcallback);
    });
}

function processOneDevice(kind, into) {
    return httpRequest('https://d1ge76rambtuys.cloudfront.net/icons/' + kind + '.png').then((stream) => {
        return makeColorScheme(stream);
    }).then(([colors_dominant, colors_palette_default, colors_palette_light]) => {
        console.log('processed ' + kind);
        into[kind] = {
            colors_dominant, colors_palette_default, colors_palette_light
        };
    }).catch((e) => {
        console.error('failed to process ' + kind, e);
        into[kind] = {};
    });
}

function updateColorScheme(dbClient, kind) {
    return Q.nfcall(fs.readFile, TARGET_JSON).then((data) => JSON.parse(data)).then((parsed) => {
         let into = {};
         processOneDevice(kind, into).then(() => {
             parsed[kind] = into;
         }).then(() => {
             return Q.nfcall(fs.writeFile, TARGET_JSON, JSON.stringify(parsed, undefined, 2));
         });
    });
}

db.withClient((dbClient) => {
    return updateColorScheme(dbClient, 'com.pubgtracker');
}).done();

module.exports = updateColorScheme;
