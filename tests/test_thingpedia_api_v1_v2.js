// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 Google LLC
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const assert = require('assert');
const Tp = require('thingpedia');

const Config = require('../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'embedded');
assert.strictEqual(Config.THINGPEDIA_URL, '/thingpedia');

const THINGPEDIA_URL = 'http://127.0.0.1:8080/thingpedia';
async function request(url) {
    const result = await Tp.Helpers.Http.get(THINGPEDIA_URL + url);
    //console.log(result);
    return JSON.parse(result);
}

const BING_SCHEMA = {
    kind_type: 'primary',
    triggers: {},
    actions: {},
    queries: {
        image_search: {
            types: ["String", "String", "Entity(tt:picture)", "Entity(tt:url)", "Number", "Number"],
            args: ["query", "title", "picture_url", "link", "width", "height"],
            required: [true, false, false, false, false, false],
            is_input: [true, false, false, false, false, false],
            is_list: true,
            is_monitorable: true
        },
        web_search: {
            types: ["String", "String", "String", "Entity(tt:url)"],
            args: ["query", "title", "description", "link"],
            required: [true, false, false, false],
            is_input: [true, false, false, false],
            is_list: true,
            is_monitorable: true
        }
    }
};

async function testGetSchemas() {
    assert.deepStrictEqual(await request('/api/schema/com.bing'), {
        'com.bing': BING_SCHEMA
    });
}

async function main() {
    await testGetSchemas();
}
main();
