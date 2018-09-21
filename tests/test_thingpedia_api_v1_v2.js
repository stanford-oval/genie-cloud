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

const BING_METADATA = {
    kind_type: 'primary',
    triggers: {},
    actions: {},
    queries: {
        image_search: {
            schema: ["String", "String", "Entity(tt:picture)", "Entity(tt:url)", "Number", "Number"],
            args: ["query", "title", "picture_url", "link", "width", "height"],
            required: [true, false, false, false, false, false],
            is_input: [true, false, false, false, false, false],
            is_list: true,
            is_monitorable: true,
            confirmation: "images matching $query from Bing",
            confirmation_remote: "images matching $query from Bing",
            doc: "search for `query` on Bing Images",
            canonical: "image search on bing",
            argcanonicals: ["query", "title", "picture url", "link", "width", "height"],
            questions: [
              "What do you want to search?",
              "",
              "",
              "",
              "What width are you looking for (in pixels)?",
              "What height are you looking for (in pixels)?"
            ]
        },
        web_search: {
            schema: ["String", "String", "String", "Entity(tt:url)"],
            args: ["query", "title", "description", "link"],
            required: [true, false, false, false],
            is_input: [true, false, false, false],
            is_list: true,
            is_monitorable: true,
            confirmation: "websites matching $query on Bing",
            confirmation_remote: "websites matching $query on Bing",
            doc: "search for `query` on Bing",
            canonical: "web search on bing",
            argcanonicals: ["query", "title", "description", "link"],
            questions: [
              "What do you want to search?",
              "",
              "",
              ""
            ]
        }
    }
};

async function testGetSchemas() {
    assert.deepStrictEqual(await request('/api/schema/com.bing'), {
        'com.bing': BING_SCHEMA
    });

    assert.deepStrictEqual(await request('/api/schema/com.bing,org.thingpedia.builtin.test.nonexistent'), {
        'com.bing': BING_SCHEMA
    });

    assert.deepStrictEqual(await request('/api/schema/com.bing,org.thingpedia.builtin.test.invisible'), {
        'com.bing': BING_SCHEMA,
        'org.thingpedia.builtin.test.invisible': {
            kind_type: 'primary',
            triggers: {},
            queries: {},
            actions: {}
        }
    });
}

async function testGetMetadata() {
    assert.deepStrictEqual(await request('/api/schema-metadata/com.bing'), {
        'com.bing': BING_METADATA
    });

    assert.deepStrictEqual(await request('/api/schema-metadata/com.bing,org.thingpedia.builtin.test.nonexistent'), {
        'com.bing': BING_METADATA
    });

    assert.deepStrictEqual(await request('/api/schema-metadata/com.bing,org.thingpedia.builtin.test.invisible'), {
        'com.bing': BING_METADATA,
        'org.thingpedia.builtin.test.invisible': {
            kind_type: 'primary',
            triggers: {},
            queries: {},
            actions: {}
        }
    });
}

async function main() {
    await testGetSchemas();
    await testGetMetadata();
}
main();
