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
require('./polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const assert = require('assert');
const Tp = require('thingpedia');
const ThingTalk = require('thingtalk');

const Config = require('../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'embedded');
assert.strictEqual(Config.THINGPEDIA_URL, '/thingpedia');

/*function toCharArray(str) {
    const array = new Array(str.length);
    for (let i = 0; i < str.length; i++)
        array[i] = str.charCodeAt(i);
    return array;
}*/

const THINGPEDIA_URL = 'http://127.0.0.1:8080/thingpedia/api/v3';
async function request(url) {
    const result = await Tp.Helpers.Http.get(THINGPEDIA_URL + url, { accept: 'application/json' });
    //console.log(result);
    return JSON.parse(result);
}
async function streamRequest(url, options) {
    return Tp.Helpers.Http.getStream(THINGPEDIA_URL + url, options);
}
async function ttRequest(url) {
    const result = await Tp.Helpers.Http.get(THINGPEDIA_URL + url, { accept: 'application/x-thingtalk' });
    //console.log(result);
    return result;
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
            types: ["String", "String", "Entity(tt:picture)", "Entity(tt:url)", "Number", "Number"],
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
            ],
            string_values: [
              "tt:search_query",
              "tt:short_free_text",
              null,
              null,
              null,
              null
            ]
        },
        web_search: {
            types: ["String", "String", "String", "Entity(tt:url)"],
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
            ],
            string_values: [
              "tt:search_query",
              "tt:short_free_text",
              "tt:long_free_text",
              null,
            ]
        }
    }
};

const BING_CLASS = `class @com.bing {
  monitorable list query image_search(in req query: String,
                                      out title: String,
                                      out picture_url: Entity(tt:picture),
                                      out link: Entity(tt:url),
                                      out width: Number,
                                      out height: Number);

  monitorable list query web_search(in req query: String,
                                    out title: String,
                                    out description: String,
                                    out link: Entity(tt:url));
}
`;
const BING_CLASS_WITH_METADATA = `class @com.bing {
  monitorable list query image_search(in req query: String #_[prompt="What do you want to search?"] #_[canonical="query"] #[string_values="tt:search_query"],
                                      out title: String #_[canonical="title"] #[string_values="tt:short_free_text"],
                                      out picture_url: Entity(tt:picture) #_[canonical="picture url"],
                                      out link: Entity(tt:url) #_[canonical="link"],
                                      out width: Number #_[prompt="What width are you looking for (in pixels)?"] #_[canonical="width"],
                                      out height: Number #_[prompt="What height are you looking for (in pixels)?"] #_[canonical="height"])
  #_[canonical="image search on bing"]
  #_[confirmation="images matching $query from Bing"];

  monitorable list query web_search(in req query: String #_[prompt="What do you want to search?"] #_[canonical="query"] #[string_values="tt:search_query"],
                                    out title: String #_[canonical="title"] #[string_values="tt:short_free_text"],
                                    out description: String #_[canonical="description"] #[string_values="tt:long_free_text"],
                                    out link: Entity(tt:url) #_[canonical="link"])
  #_[canonical="web search on bing"]
  #_[confirmation="websites matching $query on Bing"];
}
`;
const BING_CLASS_FULL = `class @com.bing
#[version=0] {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  monitorable list query web_search(in req query: String #_[prompt="What do you want to search?"] #_[canonical="query"] #[string_values="tt:search_query"],
                                    out title: String #_[canonical="title"] #[string_values="tt:short_free_text"],
                                    out description: String #_[canonical="description"] #[string_values="tt:long_free_text"],
                                    out link: Entity(tt:url) #_[canonical="link"])
  #_[canonical="web search on bing"]
  #_[confirmation="websites matching $query on Bing"]
  #_[formatted=[{type="rdl",webCallback="${'${link}'}",displayTitle="${'${title}'}",displayText="${'${description}'}"}]]
  #[poll_interval=3600000ms]
  #[doc="search for ${'`query`'} on Bing"];

  monitorable list query image_search(in req query: String #_[prompt="What do you want to search?"] #_[canonical="query"] #[string_values="tt:search_query"],
                                      out title: String #_[canonical="title"] #[string_values="tt:short_free_text"],
                                      out picture_url: Entity(tt:picture) #_[canonical="picture url"],
                                      out link: Entity(tt:url) #_[canonical="link"],
                                      out width: Number #_[prompt="What width are you looking for (in pixels)?"] #_[canonical="width"],
                                      out height: Number #_[prompt="What height are you looking for (in pixels)?"] #_[canonical="height"])
  #_[canonical="image search on bing"]
  #_[confirmation="images matching $query from Bing"]
  #_[formatted=[{type="rdl",webCallback="${'${link}'}",displayTitle="${'${title}'}"}, {type="picture",url="${'${picture_url}'}"}]]
  #[poll_interval=3600000ms]
  #[doc="search for ${'`query`'} on Bing Images"];
}
`;

const INVISIBLE_CLASS = `class @org.thingpedia.builtin.test.invisible {
  action eat_data(in req data: String);
}
`;
const INVISIBLE_CLASS_WITH_METADATA = `class @org.thingpedia.builtin.test.invisible {
  action eat_data(in req data: String #_[prompt="What do you want me to consume?"] #_[canonical="data"])
  #_[canonical="eat data on test"]
  #_[confirmation="consume $data"];
}
`;

async function testGetSchemas() {
    assert.deepStrictEqual(await request('/schema/com.bing'), {
        result: 'ok',
        data: {
            'com.bing': BING_SCHEMA
        }
    });
    assert.deepStrictEqual(await ttRequest('/schema/com.bing'), BING_CLASS);

    assert.deepStrictEqual(await request('/schema/com.bing,org.thingpedia.builtin.test.nonexistent'), {
        result: 'ok',
        data: {
            'com.bing': BING_SCHEMA
        }
    });
    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.nonexistent'), BING_CLASS);

    assert.deepStrictEqual(await request('/schema/com.bing,org.thingpedia.builtin.test.invisible'), {
        result: 'ok',
        data: {
            'com.bing': BING_SCHEMA
        }
    });
    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.invisible'), BING_CLASS);

    assert.deepStrictEqual(await request(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: {
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
        }
    });
    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS + INVISIBLE_CLASS);

    assert.deepStrictEqual(await request(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: {
            'com.bing': BING_SCHEMA
        }
    });
    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS);
}

async function testGetMetadata() {
    assert.deepStrictEqual(await request('/schema/com.bing?meta=1'), {
        result: 'ok',
        data: {
            'com.bing': BING_METADATA
        }
    });
    assert.deepStrictEqual(await ttRequest('/schema/com.bing?meta=1'), BING_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await request('/schema/com.bing,org.thingpedia.builtin.test.nonexistent?meta=1'), {
        result: 'ok',
        data: {
            'com.bing': BING_METADATA
        }
    });
    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.nonexistent?meta=1'),
        BING_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await request('/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1'), {
        result: 'ok',
        data: {
            'com.bing': BING_METADATA
        }
    });
    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1'),
        BING_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await request(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1&developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: {
            'com.bing': BING_METADATA,
            'org.thingpedia.builtin.test.invisible': {
                kind_type: "primary",
                triggers: {},
                queries: {},
                actions: {
                    "eat_data": {
                        types: ["String"],
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
                        is_monitorable: false,
                        string_values: [null]
                    }
                }
            }
        }
    });

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1&developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS_WITH_METADATA + INVISIBLE_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await request(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?meta=1&developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: {
            'com.bing': BING_METADATA
        }
    });

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?meta=1&developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS_WITH_METADATA);
}

function checkExamples(generated, expected) {
    assert.strictEqual(generated.result, 'ok');
    generated = generated.data;
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
        //assert.deepStrictEqual(gen.target_code,
        //    expectMap.get(gen.utterance).program);
        ThingTalk.Grammar.parse(gen.target_code);

        assert.strictEqual(typeof gen.preprocessed, 'string');
        assert.strictEqual(typeof gen.click_count, 'number');
        assert(gen.click_count >= 0);
    }
}
function checkExamplesByKey(generated, key) {
    assert.strictEqual(generated.result, 'ok');
    generated = generated.data;
    const uniqueIds = new Set;

    for (let gen of generated) {
        assert(!uniqueIds.has(gen.id), `duplicate id ${gen.id}`);
        uniqueIds.add(gen.id);

        assert(gen.utterance.toLowerCase().indexOf(key) >= 0, `expected ${gen.utterance} to contain ${key}`);

        assert.strictEqual(typeof gen.preprocessed, 'string');
        assert.strictEqual(typeof gen.utterance, 'string');
        assert.strictEqual(typeof gen.target_code, 'string');
        ThingTalk.Grammar.parse(gen.target_code);
        assert.strictEqual(typeof gen.click_count, 'number');
        assert(gen.click_count >= 0);
    }
}

const TEST_EXAMPLES = { result: 'ok', data: require('./data/test-examples-v3.json') };

async function testGetExamplesByDevice() {
    // mind the . vs .. here: there's two different data/ folders
    const BING_EXAMPLES = require('./data/com.bing.manifest.json').examples;
    const BUILTIN_EXAMPLES = require('../data/org.thingpedia.builtin.thingengine.builtin.manifest.json').examples;
    const INVISIBLE_EXAMPLES = require('./data/org.thingpedia.builtin.test.invisible.manifest.json').examples;

    checkExamples(await request('/examples/by-kinds/com.bing'), BING_EXAMPLES);
    checkExamples(await request('/examples/by-kinds/org.thingpedia.builtin.thingengine.builtin'),
        BUILTIN_EXAMPLES);
    checkExamples(await request(
        '/examples/by-kinds/org.thingpedia.builtin.thingengine.builtin,com.bing'),
        BUILTIN_EXAMPLES.concat(BING_EXAMPLES));

    checkExamples(await request('/examples/by-kinds/org.thingpedia.builtin.test.invisible'), []);

    checkExamples(await request(
        `/examples/by-kinds/org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);

    checkExamples(await request(
        `/examples/by-kinds/org.thingpedia.builtin.test.invisible,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);

    checkExamples(await request('/examples/by-kinds/org.thingpedia.builtin.test.nonexistent'), []);

    assert.deepStrictEqual(await request('/examples/by-kinds/org.thingpedia.builtin.test'), TEST_EXAMPLES);

    assert.deepStrictEqual((await ttRequest('/examples/by-kinds/org.thingpedia.builtin.test')).trim(), `dataset @org.thingpedia.dynamic.by_kinds.org_thingpedia_builtin_test language "en" {
    action  := @org.thingpedia.builtin.test.eat_data()
    #_[utterances=["eat some data"]]
    #_[preprocessed=["eat some data"]]
    #[id=1000] #[click_count=0];
    query (p_size :Measure(byte))  := @org.thingpedia.builtin.test.get_data(size=p_size)
    #_[utterances=["get ${'${p_size}'} of data"]]
    #_[preprocessed=["get ${'${p_size}'} of data"]]
    #[id=1001] #[click_count=7];
    program := monitor (@org.thingpedia.builtin.test.get_data()) => @org.thingpedia.builtin.test.eat_data()
    #_[utterances=["keep eating data!","keep eating data! (v2)"]]
    #_[preprocessed=["keep eating data !","keep eating data ! -lrb- v2 -rrb-"]]
    #[id=1002] #[click_count=0];
    action () := @org.thingpedia.builtin.test.eat_data()
    #_[utterances=["more data eating..."]]
    #_[preprocessed=["more data eating ..."]]
    #[id=1004] #[click_count=0];
    query  := @org.thingpedia.builtin.test.get_data()
    #_[utterances=["more data genning..."]]
    #_[preprocessed=["more data genning ..."]]
    #[id=1005] #[click_count=0];
}`);
}

async function testGetExamplesByKey() {
    // mind the . vs .. here: there's two different data/ folders
    const BING_EXAMPLES = require('./data/com.bing.manifest.json').examples;
    const PHONE_EXAMPLES = require('../data/org.thingpedia.builtin.thingengine.phone.manifest.json').examples;
    const INVISIBLE_EXAMPLES = require('./data/org.thingpedia.builtin.test.invisible.manifest.json').examples;

    checkExamples(await request('/examples/search?q=bing'), BING_EXAMPLES);
    checkExamples(await request('/examples/search?q=phone'), PHONE_EXAMPLES);
    checkExamplesByKey(await request('/examples/search?q=matching'), 'matching');

    checkExamples(await request('/examples/search?q=invisible'), []);
    checkExamples(await request(`/examples/search?q=invisible&developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);

    assert.deepStrictEqual(await request('/examples/search?q=data'), TEST_EXAMPLES);

    assert.deepStrictEqual(await ttRequest('/examples/search?q=data'), `dataset @org.thingpedia.dynamic.by_key.data language "en" {
    action  := @org.thingpedia.builtin.test.eat_data()
    #_[utterances=["eat some data"]]
    #_[preprocessed=["eat some data"]]
    #[id=1000] #[click_count=0];
    query (p_size :Measure(byte))  := @org.thingpedia.builtin.test.get_data(size=p_size)
    #_[utterances=["get ${'${p_size}'} of data"]]
    #_[preprocessed=["get ${'${p_size}'} of data"]]
    #[id=1001] #[click_count=7];
    program := monitor (@org.thingpedia.builtin.test.get_data()) => @org.thingpedia.builtin.test.eat_data()
    #_[utterances=["keep eating data!","keep eating data! (v2)"]]
    #_[preprocessed=["keep eating data !","keep eating data ! -lrb- v2 -rrb-"]]
    #[id=1002] #[click_count=0];
    action () := @org.thingpedia.builtin.test.eat_data()
    #_[utterances=["more data eating..."]]
    #_[preprocessed=["more data eating ..."]]
    #[id=1004] #[click_count=0];
    query  := @org.thingpedia.builtin.test.get_data()
    #_[utterances=["more data genning..."]]
    #_[preprocessed=["more data genning ..."]]
    #[id=1005] #[click_count=0];
}`);
}

async function testGetDeviceIcon() {
    let failed = false;
    try {
        await Tp.Helpers.Http.get(THINGPEDIA_URL + '/devices/icon/com.bing',
            { followRedirects: false });
        failed = true;
    } catch(e) {
        assert.strictEqual(e.code, 301);
        assert(e.redirect.endsWith('.png'));
    }
    assert(!failed);
}

function deepClone(x) {
    // stupid algorithm but it does the job
    return JSON.parse(JSON.stringify(x));
}

function checkManifest(obtained, expected) {
    assert.strictEqual(obtained.result, 'ok');
    obtained = obtained.data;

    delete expected.thingpedia_name;
    delete expected.thingpedia_description;
    delete expected.examples;

    assert.strictEqual(typeof obtained.version, 'number');
    assert.strictEqual(typeof obtained.developer, 'boolean');
    assert(!obtained.examples || Array.isArray(obtained.examples));

    delete obtained.version;
    delete obtained.developer;
    delete obtained.examples;
}

async function testGetDeviceManifest() {
    const BING = deepClone(require('./data/com.bing.manifest.json'));
    const INVISIBLE = deepClone(require('./data/org.thingpedia.builtin.test.invisible.manifest.json'));

    checkManifest(await request('/devices/code/com.bing'), BING);

    //console.log(String(toCharArray(BING_CLASS_FULL)));
    assert.strictEqual(await ttRequest('/devices/code/com.bing'), BING_CLASS_FULL);

    await assert.rejects(() => request('/devices/code/org.thingpedia.builtin.test.invisible'));
    checkManifest(await request(
        `/devices/code/org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE);

    await assert.rejects(() => request(
        `/devices/code/org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`));
}

async function testGetDevicePackage() {
    const source = await streamRequest('/devices/package/com.bing');
    await new Promise((resolve, reject) => {
        source.on('error', reject);
        source.on('end', resolve);
        source.resume();
    });
}

async function testGetDeviceSetup() {
    assert.deepStrictEqual(await request('/devices/setup/com.bing'), {
        result: 'ok',
        data: {
            'com.bing': {
                text: "Bing Search",
                category: 'data',
                type: 'none',
                kind: 'com.bing'
            }
        }
    });

    assert.deepStrictEqual(await request('/devices/setup/org.thingpedia.builtin.thingengine.builtin'), {
        result: 'ok',
        data: {
            'org.thingpedia.builtin.thingengine.builtin': {
                type: 'multiple',
                choices: []
            }
        }
    });

    assert.deepStrictEqual(await request('/devices/setup/com.bing,org.thingpedia.builtin.thingengine.builtin'), {
        result: 'ok',
        data: {
            'com.bing': {
                text: "Bing Search",
                category: 'data',
                type: 'none',
                kind: 'com.bing'
            },
            'org.thingpedia.builtin.thingengine.builtin': {
                type: 'multiple',
                choices: []
            }
        }
    });

    assert.deepStrictEqual(await request('/devices/setup/org.thingpedia.builtin.test.invisible'), {
        result: 'ok',
        data: {
            'org.thingpedia.builtin.test.invisible': {
                type: 'multiple',
                choices: []
            }
        }
    });

    assert.deepStrictEqual(await request(
        `/devices/setup/org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: {
            'org.thingpedia.builtin.test.invisible': {
                type: 'oauth2',
                text: "Invisible Device",
                category: 'system',
                kind: 'org.thingpedia.builtin.test.invisible'
            }
        }
    });

    assert.deepStrictEqual(await request('/devices/setup/messaging'), {
        result: 'ok',
        data: {
            'messaging': {
                type: 'interactive',
                text: "Matrix",
                category: 'online',
                kind: 'org.thingpedia.builtin.matrix'
            },
            'org.thingpedia.builtin.matrix': {
                type: 'interactive',
                text: "Matrix",
                category: 'online',
                kind: 'org.thingpedia.builtin.matrix'
            },
        }
    });

    /*    'com.bing': {
            text: "Bing Search",
            category: 'data',
            type: 'none',
            kind: 'com.bing'
        }
    });*/
}

function assertNonEmptyString(what) {
    assert(typeof what === 'string' && what, 'Expected a non-empty string, got ' + what);
}

async function testGetDeviceSetupList(_class) {
    const EXPECTED = {
        'online': ['org.thingpedia.builtin.matrix'],
        'physical': ['org.thingpedia.builtin.bluetooth.generic'],
        'data': ['com.bing'],
    };

    const kinds = new Set;
    const result = await request('/devices/setup?' + (_class !== null ? `class=${_class}` : ''));
    assert.strictEqual(result.result, 'ok');
    for (let dev of result.data) {
        assert(!kinds.has(dev.kind));
        kinds.add(dev.kind);

        assertNonEmptyString(dev.text);
        assertNonEmptyString(dev.kind);
        if (_class) {
            assert.strictEqual(dev.category, _class);
            assert(EXPECTED[_class].includes(dev.kind),
                   `unexpected device ${dev.kind} in category ${_class}`);
        }

        assert(['none', 'discovery', 'interactive', 'form', 'oauth2'].indexOf(dev.type) >= 0,
        `Invalid factory type ${dev.type} for ${dev.kind}`);
    }
}

async function testGetDeviceList(_class) {
    const EXPECTED = {
        'online': ['org.thingpedia.builtin.matrix'],
        'physical': ['org.thingpedia.builtin.thingengine.phone',
                     'org.thingpedia.builtin.thingengine.home',
                     'org.thingpedia.builtin.thingengine.gnome',
                     'org.thingpedia.builtin.bluetooth.generic'],
        'data': ['com.bing',
                 'org.thingpedia.builtin.thingengine.builtin'],
        'system': ['org.thingpedia.builtin.test',
                   'org.thingpedia.builtin.thingengine',
                   'org.thingpedia.builtin.thingengine.remote',
                   'messaging']
    };

    const publicDevices = new Set;

    const { data: page0 } = await request('/devices/all?' + (_class !== null ? `class=${_class}` : ''));

    // weird values for page are the same as ignored
    const { data: pageMinusOne } = await request('/devices/all?page=-1&' + (_class !== null ? `class=${_class}` : ''));
    assert.deepStrictEqual(pageMinusOne, page0);
    const { data: pageInvalid } = await request('/devices/all?page=invalid&' + (_class !== null ? `class=${_class}` : ''));
    assert.deepStrictEqual(pageInvalid, page0);

    const kinds = new Set;
    for (let i = 0; ; i++) {
        const { data: page } = await request(`/devices/all?page=${i}&page_size=10&` + (_class !== null ? `class=${_class}` : ''));
        if (i === 0)
            assert.deepStrictEqual(page, page0);
        for (let j = 0; j < Math.min(page.length, 10); j++) {
            const device = page[j];
            assert(!kinds.has(device.primary_kind));
            kinds.add(device.primary_kind);

            assertNonEmptyString(device.name);
            assertNonEmptyString(device.description);
            assertNonEmptyString(device.primary_kind);
            assertNonEmptyString(device.category);
            assertNonEmptyString(device.subcategory);
            if (_class) {
                assert.deepStrictEqual(device.category, _class);
                assert(EXPECTED[_class].includes(device.primary_kind),`unexpected device ${device.primary_kind} in category ${_class}`);
            }

            // no duplicates
            assert(!publicDevices.has(device.primary_kind));
            publicDevices.add(device.primary_kind);
        }
        if (page.length <= 10)
            break;
    }

    assert(!kinds.has('org.thingpedia.builtin.test.invisible'));
    assert(!kinds.has('org.thingpedia.builtin.test.adminonly'));
}

async function testDeviceSearch() {
    assert.deepStrictEqual(await request('/devices/search?q=bing'), {
        result: 'ok',
        data: [{
            primary_kind: 'com.bing',
            name: 'Bing Search',
            description: 'Search the web with Bing',
            category: 'data',
            subcategory: 'service'
        }]
    });

    assert.deepStrictEqual(await request('/devices/search?q=invisible'), {
        result: 'ok',
        data: [] });

    assert.deepStrictEqual(await request(`/devices/search?q=invisible&developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: [{
            primary_kind: 'org.thingpedia.builtin.test.invisible',
            name: 'Invisible Device',
            description: 'This device is owned by Bob. It was not approved.',
            category: 'system',
            subcategory: 'service'
        }]
    });

    assert.deepStrictEqual(await request(`/devices/search?q=bing+invisible&developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: []
    });
}

async function testDiscovery() {
    assert.deepStrictEqual(JSON.parse(await Tp.Helpers.Http.post(THINGPEDIA_URL + '/devices/discovery',
        JSON.stringify({
            kind: 'bluetooth',
            uuids: [],
            class: 0
        }), { dataContentType: 'application/json'})), {
        result: 'ok',
        data: {
            kind: 'org.thingpedia.builtin.bluetooth.generic'
        }
    });

    let failed = false;
    try {
        await Tp.Helpers.Http.post(THINGPEDIA_URL + '/devices/discovery',
            JSON.stringify({
                kind: 'invalid',
            }), { dataContentType: 'application/json'});
        failed = true;
    } catch(e) {
        assert.strictEqual(e.code, 404);
        assert.deepStrictEqual(JSON.parse(e.detail), { error: 'Not Found' });
    }
    assert(!failed);

    failed = false;
    try {
        await Tp.Helpers.Http.post(THINGPEDIA_URL + '/devices/discovery',
            JSON.stringify({
                // LG TV
                kind: 'upnp',
                name: '',
                deviceType: '',
                modelUrl: null,
                st: ['urn:lge:com:service:webos:second-screen-1'],
                class: 0
            }), { dataContentType: 'application/json'});
        failed = true;
    } catch(e) {
        assert.strictEqual(e.code, 404);
        assert.deepStrictEqual(JSON.parse(e.detail), { error: 'Not Found' });
    }
    assert(!failed);
}

async function testGetEntityIcon() {
    let failed = false;
    try {
        await Tp.Helpers.Http.get(THINGPEDIA_URL + '/entities/icon?entity_type=tt:stock_id&entity_value=goog&entity_display=Alphabet+Inc.',
            { followRedirects: false });
        failed = true;
    } catch(e) {
        assert.strictEqual(e.code, 301);
        assert(e.redirect.endsWith('.png'));
    }
    assert(!failed);
}

async function testGetEntityList() {
    assert.deepStrictEqual(await request('/entities/all'),
        {"result":"ok",
        "data":[{
            "type":"org.freedesktop:app_id",
            "name":"Freedesktop App Identifier",
            "is_well_known":0,
            "has_ner_support":1
        },{
            "type":"tt:stock_id",
            "name":"Company Stock ID",
            "is_well_known":0,
            "has_ner_support":1
        },{
            "type":"tt:contact",
            "name":"Contact Identity",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:contact_name",
            "name":"Contact Name",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:device",
            "name":"Device Name",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:email_address",
            "name":"Email Address",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:flow_token",
            "name":"Flow Identifier",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:function",
            "name":"Function Name",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:hashtag",
            "name":"Hashtag",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:path_name",
            "name":"Unix Path",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:phone_number",
            "name":"Phone Number",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:picture",
            "name":"Picture",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:program",
            "name":"Program",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:url",
            "name":"URL",
            "is_well_known":1,
            "has_ner_support":0
        },{
            "type":"tt:username",
            "name":"Username",
            "is_well_known":1,
            "has_ner_support":0
        }]}
    );
}

async function testGetEntityValues() {
    assert.deepStrictEqual(await request('/entities/list/tt:username'), {
        result: 'ok',
        data: []
    });

    assert.deepStrictEqual(await request('/entities/list/org.freedesktop:app_id'), {
        result: 'ok',
        data: [
        { value: 'edu.stanford.Almond', name: 'Almond', canonical: 'almond' },
        { value: 'org.gnome.Builder', name: 'GNOME Builder', canonical: 'gnome builder' },
        { value: 'org.gnome.Weather.Application', name: 'GNOME Weather', canonical: 'gnome weather' }
        ]
    });
}

async function testLookupEntity() {
    assert.deepStrictEqual(await request('/entities/lookup?q=gnome'), {
        result: 'ok',
        data: [
        {
          type: 'org.freedesktop:app_id',
          value: 'org.gnome.Builder',
          canonical: 'gnome builder',
          name: 'GNOME Builder'
        },{
          type: 'org.freedesktop:app_id',
          value: 'org.gnome.Weather.Application',
          canonical: 'gnome weather',
          name: 'GNOME Weather' }
        ]
    });
    assert.deepStrictEqual(await request('/entities/lookup?q=builder'), {
        result: 'ok',
        data: [
        {
          type: 'org.freedesktop:app_id',
          value: 'org.gnome.Builder',
          canonical: 'gnome builder',
          name: 'GNOME Builder'
        }]
    });

    assert.deepStrictEqual(await request('/entities/lookup/org.freedesktop:app_id?q=gnome'), {
        result: 'ok',
        meta: {
            name: 'Freedesktop App Identifier',
            has_ner_support: 1,
            is_well_known: 0
        },
        data: [
        {
          type: 'org.freedesktop:app_id',
          value: 'org.gnome.Builder',
          canonical: 'gnome builder',
          name: 'GNOME Builder'
        },{
          type: 'org.freedesktop:app_id',
          value: 'org.gnome.Weather.Application',
          canonical: 'gnome weather',
          name: 'GNOME Weather' }
        ]
    });

    assert.deepStrictEqual(await request('/entities/lookup/tt:stock_id?q=gnome'), {
        result: 'ok',
        meta: {
            name: 'Company Stock ID',
            has_ner_support: 1,
            is_well_known: 0
        },
        data: []
    });

}

async function main() {
    await testGetSchemas();
    await testGetMetadata();
    await testGetExamplesByDevice();
    await testGetExamplesByKey();
    await testGetDeviceIcon();
    await testGetDeviceManifest();
    await testGetDevicePackage();
    await testGetDeviceSetup();
    await testGetDeviceSetupList(null);
    await testGetDeviceSetupList('online');
    await testGetDeviceSetupList('data');
    await testGetDeviceSetupList('physical');
    await testGetDeviceList(null);
    await testGetDeviceList('online');
    await testGetDeviceList('data');
    await testGetDeviceList('physical');
    await testGetDeviceList('system');
    await testDiscovery();
    await testDeviceSearch();
    await testGetEntityIcon();
    await testGetEntityList();
    await testGetEntityValues();
    await testLookupEntity();
}
main();
