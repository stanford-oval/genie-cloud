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
        'com.bing': BING_SCHEMA
    });

    assert.deepStrictEqual(await request(
        `/api/schema/com.bing,org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`), {
        'com.bing': BING_SCHEMA,
        'org.thingpedia.builtin.test.invisible': {
            kind_type: 'primary',
            triggers: {},
            queries: {},
            actions: {
                "eat_data": {
                    types: ["String"],
                    args: ["data"],
                    is_input: [true],
                    required: [true],
                    is_monitorable: false,
                    is_list: false
                },
            }
        }
    });

    assert.deepStrictEqual(await request(
        `/api/schema/com.bing,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`), {
        'com.bing': BING_SCHEMA
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
        'com.bing': BING_METADATA
    });

    assert.deepStrictEqual(await request(
        `/api/schema-metadata/com.bing,org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`), {
        'com.bing': BING_METADATA,
        'org.thingpedia.builtin.test.invisible': {
            kind_type: "primary",
            triggers: {},
            queries: {},
            actions: {
                "eat_data": {
                    schema: ["String"],
                    args: ["data"],
                    is_input: [true],
                    required: [true],
                    questions: ["What do you want me to consume?"],
                    argcanonicals: ["data"],
                    doc: "consume some data, do nothing",
                    confirmation: "consume $data",
                    confirmation_remote: "consume $data on $__person's Almond",
                    canonical: "eat data on test",
                    is_list: false,
                    is_monitorable: false
                }
            }
        }
    });

    assert.deepStrictEqual(await request(
        `/api/schema-metadata/com.bing,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`), {
        'com.bing': BING_METADATA
    });
}

function checkExamples(generated, expected) {
    const uniqueIds = new Set;
    const expectMap = new Map;
    assert.strictEqual(generated.length, expected.length);

    for (let exp of expected) {
        delete exp.id;
        expectMap.set(exp.utterance, exp);
    }

    for (let gen of generated) {
        assert(!uniqueIds.has(gen.id), `duplicate id ${gen.id}`);
        uniqueIds.add(gen.id);

        delete gen.id;
        assert.deepStrictEqual(gen.target_code,
            expectMap.get(gen.utterance).program);

        assert.strictEqual(typeof gen.preprocessed, 'string');
        assert.strictEqual(typeof gen.click_count, 'number');
        assert(gen.click_count >= 0);
    }
}
function checkExamplesByKey(generated, key) {
    const uniqueIds = new Set;

    for (let gen of generated) {
        assert(!uniqueIds.has(gen.id), `duplicate id ${gen.id}`);
        uniqueIds.add(gen.id);

        assert(gen.utterance.toLowerCase().indexOf(key) >= 0, `expected ${gen.utterance} to contain ${key}`);

        assert.strictEqual(typeof gen.preprocessed, 'string');
        assert.strictEqual(typeof gen.utterance, 'string');
        assert.strictEqual(typeof gen.target_code, 'string');
        assert.strictEqual(typeof gen.click_count, 'number');
        assert(gen.click_count >= 0);
    }
}


async function testGetExamplesByDevice() {
    // mind the . vs .. here: there's two different data/ folders
    const BING_EXAMPLES = require('./data/com.bing.manifest.json').examples;
    const BUILTIN_EXAMPLES = require('../data/org.thingpedia.builtin.thingengine.builtin.manifest.json').examples;
    const INVISIBLE_EXAMPLES = require('./data/org.thingpedia.builtin.test.invisible.manifest.json').examples;

    checkExamples(await request('/api/examples/by-kinds/com.bing'), BING_EXAMPLES);
    checkExamples(await request('/api/examples/by-kinds/org.thingpedia.builtin.thingengine.builtin'),
        BUILTIN_EXAMPLES);
    checkExamples(await request(
        '/api/examples/by-kinds/org.thingpedia.builtin.thingengine.builtin,com.bing'),
        BUILTIN_EXAMPLES.concat(BING_EXAMPLES));

    checkExamples(await request('/api/examples/by-kinds/org.thingpedia.builtin.test.invisible'), []);

    checkExamples(await request(
        `/api/examples/by-kinds/org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);

    checkExamples(await request(
        `/api/examples/by-kinds/org.thingpedia.builtin.test.invisible,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);

    checkExamples(await request('/api/examples/by-kinds/org.thingpedia.builtin.test.nonexistent'), []);
}

async function testGetExamplesByKey() {
    // mind the . vs .. here: there's two different data/ folders
    const BING_EXAMPLES = require('./data/com.bing.manifest.json').examples;
    const PHONE_EXAMPLES = require('../data/org.thingpedia.builtin.thingengine.phone.manifest.json').examples;
    const INVISIBLE_EXAMPLES = require('./data/org.thingpedia.builtin.test.invisible.manifest.json').examples;

    checkExamples(await request('/api/examples?key=bing'), BING_EXAMPLES);
    checkExamples(await request('/api/examples?key=phone'), PHONE_EXAMPLES);
    checkExamplesByKey(await request('/api/examples?key=matching'), 'matching');

    checkExamples(await request('/api/examples?key=invisible'), []);
    checkExamples(await request(`/api/examples?key=invisible&developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);
}

async function main() {
    await testGetSchemas();
    await testGetMetadata();
    await testGetExamplesByDevice();
    await testGetExamplesByKey();
}
main();
