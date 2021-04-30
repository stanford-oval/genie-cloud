// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 Google LLC
//           2018-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

// load thingpedia to initialize the polyfill
require('thingpedia');
require('./polyfill');
process.on('unhandledRejection', (up) => { throw up; });
require('../util/config_init');

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

const THINGPEDIA_URL = Config.SERVER_ORIGIN + '/thingpedia/api/v3';
async function ttRequest(url) {
    if (url.indexOf('?') >=0 )
        url += '&thingtalk_version=1.10.0';
    else
        url += '?thingtalk_version=1.10.0';
    const result = await Tp.Helpers.Http.get(THINGPEDIA_URL + url, { accept: 'application/x-thingtalk' });
    //console.log(result);
    return result;
}

const BING_CLASS = `class @com.bing {
monitorable list query image_search(in req query : String,
                                    out title : String,
                                    out picture_url : Entity(tt:picture),
                                    out link : Entity(tt:url),
                                    out width : Number,
                                    out height : Number)
#[minimal_projection=[]];

monitorable list query web_search(in req query : String,
                                  out title : String,
                                  out description : String,
                                  out link : Entity(tt:url))
#[minimal_projection=[]];
}
`;
const BING_CLASS_FULL = `class @com.bing
#_[name="Bing Search"]
#_[description="Search the web with Bing"]
#_[canonical="bing search"]
#_[thingpedia_name="Bing Search"]
#_[thingpedia_description="Search the web with Bing"]
#[subcategory=enum(service)]
#[license="GPL-3.0"]
#[license_gplcompatible=true]
#[website="https://www.bing.com"^^tt:url]
#[repository="https://github.com/stanford-oval/thingpedia-common-devices"^^tt:url]
#[issue_tracker="https://github.com/stanford-oval/thingpedia-common-devices/issues"^^tt:url]
#[version=0]
#[package_version=0] {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none(subscription_key="12345");

monitorable list query web_search(in req query : String
                                  #_[prompt="What do you want to search?"]
                                  #_[canonical="query"]
                                  #[string_values="tt:search_query"],
                                  out title : String
                                  #_[canonical="title"]
                                  #[string_values="tt:short_free_text"],
                                  out description : String
                                  #_[canonical="description"]
                                  #[string_values="tt:long_free_text"],
                                  out link : Entity(tt:url)
                                  #_[canonical="link"])
#_[canonical=["web search on bing"]]
#_[confirmation="websites matching $query on Bing"]
#_[formatted=[{
  type="rdl",
  webCallback="\${link}",
  displayTitle="\${title}",
  displayText="\${description}"
}]]
#[poll_interval=3600000ms]
#[doc="search for \`query\` on Bing"]
#[minimal_projection=[]]
#[confirm=false];

monitorable list query image_search(in req query : String
                                    #_[prompt="What do you want to search?"]
                                    #_[canonical="query"]
                                    #[string_values="tt:search_query"],
                                    out title : String
                                    #_[canonical="title"]
                                    #[string_values="tt:short_free_text"],
                                    out picture_url : Entity(tt:picture)
                                    #_[canonical="picture url"],
                                    out link : Entity(tt:url)
                                    #_[canonical="link"],
                                    out width : Number
                                    #_[prompt="What width are you looking for (in pixels)?"]
                                    #_[canonical="width"],
                                    out height : Number
                                    #_[prompt="What height are you looking for (in pixels)?"]
                                    #_[canonical="height"])
#_[canonical=["image search on bing"]]
#_[confirmation="images matching $query from Bing"]
#_[formatted=[{
  type="rdl",
  webCallback="\${link}",
  displayTitle="\${title}"
}, {
  type="picture",
  url="\${picture_url}"
}]]
#[poll_interval=3600000ms]
#[doc="search for \`query\` on Bing Images"]
#[minimal_projection=[]]
#[confirm=false];
}
`;

const INVISIBLE_CLASS = `class @org.thingpedia.builtin.test.invisible {
action eat_data(in req data : String)
#[minimal_projection=[]];
}
`;
const ADMINONLY_CLASS = `class @org.thingpedia.builtin.test.adminonly {
action eat_data(in req data : String)
#[minimal_projection=[]];
}
`;
const INVISIBLE_CLASS_WITH_METADATA = `class @org.thingpedia.builtin.test.invisible
#_[name="Invisible Device"]
#_[description="This device is owned by Bob. It was not approved."]
#_[canonical="invisible device"]
#_[thingpedia_name="Invisible Device"]
#_[thingpedia_description="This device is owned by Bob. It was not approved."]
#[system=true]
#[subcategory=enum(service)]
#[license="GPL-3.0"]
#[license_gplcompatible=true]
#[version=0]
#[package_version=0] {
  import loader from @org.thingpedia.builtin();
  import config from @org.thingpedia.config.custom_oauth();

action eat_data(in req data : String
                #_[prompt="What do you want me to consume?"]
                #_[canonical="data"])
#_[confirmation="consume $data"]
#_[canonical=["eat data on test"]]
#[doc="consume some data, do nothing"]
#[minimal_projection=[]]
#[confirm=true];
}
`;
const ADMINONLY_CLASS_WITH_METADATA = `class @org.thingpedia.builtin.test.adminonly
#_[name="Admin-only Device"]
#_[description="This device does not exist. This entry is visible only to the administrators of Thingpedia. It exists to test that the Thingpedia API properly masks and reveals devices based on the appropriate developer key. DO NOT APPROVE THIS DEVICE."]
#_[canonical="admin-only device"]
#_[thingpedia_name="Admin-only Device"]
#_[thingpedia_description="This device does not exist. This entry is visible only to the administrators of Thingpedia. It exists to test that the Thingpedia API properly masks and reveals devices based on the appropriate developer key. DO NOT APPROVE THIS DEVICE."]
#[system=true]
#[subcategory=enum(service)]
#[license="GPL-3.0"]
#[license_gplcompatible=true]
#[version=0]
#[package_version=0] {
  import loader from @org.thingpedia.builtin();
  import config from @org.thingpedia.config.none();

action eat_data(in req data : String
                #_[prompt="What do you want me to consume?"]
                #_[canonical="data"])
#_[confirmation="consume $data"]
#_[canonical=["eat data on test"]]
#[doc="consume some data, do nothing"]
#[minimal_projection=[]]
#[confirm=true];
}
`;

async function testGetSchemas() {
    assert.deepStrictEqual(await ttRequest('/schema/com.bing'), BING_CLASS);

    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.nonexistent'), BING_CLASS);

    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.invisible'), BING_CLASS);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS + INVISIBLE_CLASS);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?developer_key=${process.env.ROOT_DEVELOPER_KEY}`),
        BING_CLASS + INVISIBLE_CLASS);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.ROOT_DEVELOPER_KEY}`),
        BING_CLASS + ADMINONLY_CLASS);
}

async function testGetMetadata() {
    assert.deepStrictEqual(await ttRequest('/schema/com.bing?meta=1'), BING_CLASS_FULL);

    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.nonexistent?meta=1'),
        BING_CLASS_FULL);

    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1'),
        BING_CLASS_FULL);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1&developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS_FULL + '\n' + INVISIBLE_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1&developer_key=${process.env.ROOT_DEVELOPER_KEY}`),
        BING_CLASS_FULL + '\n' + INVISIBLE_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?meta=1&developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS_FULL);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?meta=1&developer_key=${process.env.ROOT_DEVELOPER_KEY}`),
        BING_CLASS_FULL + '\n' + ADMINONLY_CLASS_WITH_METADATA);
}

function checkExamples(generated, expected) {
    const parsed = ThingTalk.Syntax.parse(generated, ThingTalk.Syntax.SyntaxType.Legacy);
    assert.strictEqual(parsed.datasets.length, 1);
    const dataset = parsed.datasets[0];
    const uniqueIds = new Set;
    assert.strictEqual(dataset.examples.length, expected);

    for (let gen of dataset.examples) {
        assert(!uniqueIds.has(gen.id), `duplicate id ${gen.id}`);
        uniqueIds.add(gen.id);
    }
}

async function testGetExamplesByDevice() {
    const BING_EXAMPLES = 10;
    const BUILTIN_EXAMPLES = 44;
    const INVISIBLE_EXAMPLES = 1;

    checkExamples(await ttRequest('/examples/by-kinds/com.bing'), BING_EXAMPLES);
    checkExamples(await ttRequest('/examples/by-kinds/org.thingpedia.builtin.thingengine.builtin'),
        BUILTIN_EXAMPLES);
    checkExamples(await ttRequest(
        '/examples/by-kinds/org.thingpedia.builtin.thingengine.builtin,com.bing'),
        BUILTIN_EXAMPLES + BING_EXAMPLES);

    checkExamples(await ttRequest('/examples/by-kinds/org.thingpedia.builtin.test.invisible'), 0);

    checkExamples(await ttRequest(
        `/examples/by-kinds/org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);

    checkExamples(await ttRequest(
        `/examples/by-kinds/org.thingpedia.builtin.test.invisible,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);

    checkExamples(await ttRequest('/examples/by-kinds/org.thingpedia.builtin.test.nonexistent'), 0);

    assert.strictEqual((await ttRequest('/examples/by-kinds/org.thingpedia.builtin.test')).trim(), `dataset @org.thingpedia.dynamic.by_kinds.org_thingpedia_builtin_test language "en" {
  action := @org.thingpedia.builtin.test.eat_data()
  #_[utterances=["eat some data","more data eating..."]]
  #_[preprocessed=["eat some data","more data eating ..."]]
  #[id=1000]
  #[click_count=0]
  #[like_count=0]
  #[name="EatData"];

  query (p_size :Measure(byte)) := @org.thingpedia.builtin.test.get_data(size=p_size)
  #_[utterances=["get \${p_size} of data"]]
  #_[preprocessed=["get \${p_size} of data"]]
  #[id=1001]
  #[click_count=7]
  #[like_count=0]
  #[name="GenDataWithSize"];

  program := {   monitor (@org.thingpedia.builtin.test.get_data()) => @org.thingpedia.builtin.test.eat_data();
 }
  #_[utterances=["keep eating data!","keep eating data! (v2)"]]
  #_[preprocessed=["keep eating data !","keep eating data ! -lrb- v2 -rrb-"]]
  #[id=1002]
  #[click_count=0]
  #[like_count=0]
  #[name="GenDataThenEatData"];

  query := @org.thingpedia.builtin.test.get_data()
  #_[utterances=["more data genning..."]]
  #_[preprocessed=["more data genning ..."]]
  #[id=1005]
  #[click_count=0]
  #[like_count=0]
  #[name="GenData"];
}`);
}

async function testGetExamplesByKey() {
    const BING_EXAMPLES = 10;
    const PHONE_EXAMPLES = 14;
    const INVISIBLE_EXAMPLES = 1;

    checkExamples(await ttRequest('/examples/search?q=bing'), BING_EXAMPLES);
    checkExamples(await ttRequest('/examples/search?q=phone'), PHONE_EXAMPLES);

    checkExamples(await ttRequest('/examples/search?q=invisible'), 0);
    checkExamples(await ttRequest(`/examples/search?q=invisible&developer_key=${process.env.DEVELOPER_KEY}`),
        INVISIBLE_EXAMPLES);

    assert.strictEqual(await ttRequest('/examples/search?q=data'), `dataset @org.thingpedia.dynamic.by_key.data language "en" {
  action := @org.thingpedia.builtin.test.eat_data()
  #_[utterances=["eat some data","more data eating..."]]
  #_[preprocessed=["eat some data","more data eating ..."]]
  #[id=1000]
  #[click_count=0]
  #[like_count=0]
  #[name="EatData"];

  query (p_size :Measure(byte)) := @org.thingpedia.builtin.test.get_data(size=p_size)
  #_[utterances=["get \${p_size} of data"]]
  #_[preprocessed=["get \${p_size} of data"]]
  #[id=1001]
  #[click_count=7]
  #[like_count=0]
  #[name="GenDataWithSize"];

  program := {   monitor (@org.thingpedia.builtin.test.get_data()) => @org.thingpedia.builtin.test.eat_data();
 }
  #_[utterances=["keep eating data!","keep eating data! (v2)"]]
  #_[preprocessed=["keep eating data !","keep eating data ! -lrb- v2 -rrb-"]]
  #[id=1002]
  #[click_count=0]
  #[like_count=0]
  #[name="GenDataThenEatData"];

  query := @org.thingpedia.builtin.test.get_data()
  #_[utterances=["more data genning..."]]
  #_[preprocessed=["more data genning ..."]]
  #[id=1005]
  #[click_count=0]
  #[like_count=0]
  #[name="GenData"];
}
`);
}

async function testGetDeviceManifest() {
    //console.log(String(toCharArray(BING_CLASS_FULL)));
    assert.strictEqual(await ttRequest('/devices/code/com.bing'), BING_CLASS_FULL);
    assert.strictEqual(await ttRequest(`/devices/code/com.bing?developer_key=${process.env.DEVELOPER_KEY}`), BING_CLASS_FULL);
    assert.strictEqual(await ttRequest(`/devices/code/com.bing?developer_key=${process.env.ROOT_DEVELOPER_KEY}`), BING_CLASS_FULL);

    await assert.rejects(() => ttRequest('/devices/code/org.thingpedia.builtin.test.invisible'));
    await assert.rejects(() => ttRequest('/devices/code/org.thingpedia.builtin.test.nonexistent'));

    await assert.rejects(() => ttRequest(
        `/devices/code/org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`));
}

async function testGetSnapshot() {
    let code = await ttRequest('/snapshot/-1');
    let parsed = ThingTalk.Syntax.parse(code);
    assert(parsed instanceof ThingTalk.Ast.Library && parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.invisible') === undefined);

    code = await ttRequest('/snapshot/-1?meta=1');
    parsed = ThingTalk.Syntax.parse(code);
    assert(parsed instanceof ThingTalk.Ast.Library && parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.invisible') === undefined);

    code = await ttRequest(`/snapshot/-1?developer_key=${process.env.ROOT_DEVELOPER_KEY}`);
    parsed = ThingTalk.Syntax.parse(code);
    assert(parsed instanceof ThingTalk.Ast.Library &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.invisible') !== undefined &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.adminonly') !== undefined);

    code = await ttRequest(`/snapshot/-1?meta=1&developer_key=${process.env.ROOT_DEVELOPER_KEY}`);
    parsed = ThingTalk.Syntax.parse(code);
    assert(parsed instanceof ThingTalk.Ast.Library &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.invisible') !== undefined &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.adminonly') !== undefined);

    code = await ttRequest(`/snapshot/-1?developer_key=${process.env.DEVELOPER_KEY}`);
    parsed = ThingTalk.Syntax.parse(code);
    assert(parsed instanceof ThingTalk.Ast.Library &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.invisible') !== undefined &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.adminonly') === undefined);

    code = await ttRequest(`/snapshot/-1?meta=1&developer_key=${process.env.DEVELOPER_KEY}`);
    parsed = ThingTalk.Syntax.parse(code);
    assert(parsed instanceof ThingTalk.Ast.Library &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.invisible') !== undefined &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.test.adminonly') === undefined);

    code = await ttRequest('/snapshot/1');
    parsed = ThingTalk.Syntax.parse(code);
    assert(parsed instanceof ThingTalk.Ast.Library &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.thingengine.builtin') !== undefined &&
        parsed.classes.find((c) => c.kind === 'com.bing') === undefined);

    code = await ttRequest('/snapshot/1?meta=1');
    parsed = ThingTalk.Syntax.parse(code);
    assert(parsed instanceof ThingTalk.Ast.Library &&
        parsed.classes.find((c) => c.kind === 'org.thingpedia.builtin.thingengine.builtin') !== undefined &&
        parsed.classes.find((c) => c.kind === 'com.bing') === undefined);

    code = await ttRequest(`/snapshot/1?developer_key=${process.env.ROOT_DEVELOPER_KEY}`);
    ThingTalk.Syntax.parse(code);

    code = await ttRequest(`/snapshot/1?meta=1&developer_key=${process.env.ROOT_DEVELOPER_KEY}`);
    ThingTalk.Syntax.parse(code);

    code = await ttRequest(`/snapshot/1?developer_key=${process.env.DEVELOPER_KEY}`);
    ThingTalk.Syntax.parse(code);

    code = await ttRequest(`/snapshot/1?meta=1&developer_key=${process.env.DEVELOPER_KEY}`);
    ThingTalk.Syntax.parse(code);

    assert.strictEqual(await ttRequest('/snapshot/2'), '');
}

async function main() {
    await testGetSchemas();
    await testGetMetadata();
    await testGetExamplesByDevice();
    await testGetExamplesByKey();
    await testGetDeviceManifest();
    await testGetSnapshot();
}
main();
