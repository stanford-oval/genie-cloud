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

const fs = require('fs');
const assert = require('assert');
const path = require('path');
const Tp = require('thingpedia');
const ThingTalk = require('thingtalk');
const FormData = require('form-data');
const JSZip = require('jszip');

const { sessionRequest, assertHttpError } = require('./website/scaffold');
const { login, startSession } = require('./login');

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
async function request(url, options = {}) {
    options.accept = 'application/json';
    const result = await Tp.Helpers.Http.get(THINGPEDIA_URL + url, options);
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
}`;
const BING_CLASS_WITH_METADATA = `class @com.bing
#_[canonical="bing search"] {
  monitorable list query image_search(in req query : String
                                      #_[canonical="query"]
                                      #_[prompt="What do you want to search?"]
                                      #[string_values="tt:search_query"],
                                      out title : String
                                      #_[canonical="title"]
                                      #[string_values="tt:short_free_text"],
                                      out picture_url : Entity(tt:picture)
                                      #_[canonical="picture url"],
                                      out link : Entity(tt:url)
                                      #_[canonical="link"],
                                      out width : Number
                                      #_[canonical="width"]
                                      #_[prompt="What width are you looking for (in pixels)?"],
                                      out height : Number
                                      #_[canonical="height"]
                                      #_[prompt="What height are you looking for (in pixels)?"])
  #_[canonical="image search on bing"]
  #_[confirmation="images matching $query from Bing"]
  #_[formatted=[{
    type="rdl",
    webCallback="\${link}",
    displayTitle="\${title}"
  }, {
    type="picture",
    url="\${picture_url}"
  }]]
  #[confirm=false]
  #[minimal_projection=[]];

  monitorable list query web_search(in req query : String
                                    #_[canonical="query"]
                                    #_[prompt="What do you want to search?"]
                                    #[string_values="tt:search_query"],
                                    out title : String
                                    #_[canonical="title"]
                                    #[string_values="tt:short_free_text"],
                                    out description : String
                                    #_[canonical="description"]
                                    #[string_values="tt:long_free_text"],
                                    out link : Entity(tt:url)
                                    #_[canonical="link"])
  #_[canonical="web search on bing"]
  #_[confirmation="websites matching $query on Bing"]
  #_[formatted=[{
    type="rdl",
    webCallback="\${link}",
    displayTitle="\${title}",
    displayText="\${description}"
  }]]
  #[confirm=false]
  #[minimal_projection=[]];
}`;
const BING_CLASS_FULL = `class @com.bing
#_[name="Bing Search"]
#_[description="Search the web with Bing"]
#_[canonical="bing search"]
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
  #_[canonical="web search on bing"]
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
  #_[canonical="image search on bing"]
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
}`;

const INVISIBLE_CLASS = `class @org.thingpedia.builtin.test.invisible {
  action eat_data(in req data : String)
  #[minimal_projection=[]];
}`;
const ADMINONLY_CLASS = `class @org.thingpedia.builtin.test.adminonly {
  action eat_data(in req data : String)
  #[minimal_projection=[]];
}`;
const INVISIBLE_CLASS_WITH_METADATA = `class @org.thingpedia.builtin.test.invisible
#_[canonical="invisible device"] {
  action eat_data(in req data : String
                  #_[canonical="data"]
                  #_[prompt="What do you want me to consume?"])
  #_[canonical="eat data on test"]
  #_[confirmation="consume $data"]
  #[confirm=true]
  #[minimal_projection=[]];
}`;
const ADMINONLY_CLASS_WITH_METADATA = `class @org.thingpedia.builtin.test.adminonly
#_[canonical="admin-only device"] {
  action eat_data(in req data : String
                  #_[canonical="data"]
                  #_[prompt="What do you want me to consume?"])
  #_[canonical="eat data on test"]
  #_[confirmation="consume $data"]
  #[confirm=true]
  #[minimal_projection=[]];
}`;

async function testGetSchemas() {
    assert.deepStrictEqual(await ttRequest('/schema/com.bing'), BING_CLASS);

    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.nonexistent'), BING_CLASS);

    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.invisible'), BING_CLASS);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS + '\n' + INVISIBLE_CLASS);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?developer_key=${process.env.ROOT_DEVELOPER_KEY}`),
        BING_CLASS + '\n' + INVISIBLE_CLASS);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?developer_key=${process.env.ROOT_DEVELOPER_KEY}`),
        BING_CLASS + '\n' + ADMINONLY_CLASS);
}

async function testGetMetadata() {
    assert.deepStrictEqual(await ttRequest('/schema/com.bing?meta=1'), BING_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.nonexistent?meta=1'),
        BING_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await ttRequest('/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1'),
        BING_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1&developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS_WITH_METADATA + '\n' + INVISIBLE_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.invisible?meta=1&developer_key=${process.env.ROOT_DEVELOPER_KEY}`),
        BING_CLASS_WITH_METADATA + '\n' + INVISIBLE_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?meta=1&developer_key=${process.env.DEVELOPER_KEY}`),
        BING_CLASS_WITH_METADATA);

    assert.deepStrictEqual(await ttRequest(
        `/schema/com.bing,org.thingpedia.builtin.test.adminonly?meta=1&developer_key=${process.env.ROOT_DEVELOPER_KEY}`),
        BING_CLASS_WITH_METADATA + '\n' + ADMINONLY_CLASS_WITH_METADATA);
}

function checkExamples(generated, expected) {
    const parsed = ThingTalk.Syntax.parse(generated);
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

    assert.strictEqual((await ttRequest('/examples/by-kinds/org.thingpedia.builtin.test')).trim(), `dataset @org.thingpedia.dynamic.by_kinds.org_thingpedia_builtin_test
#[language="en"] {
  action = @org.thingpedia.builtin.test.eat_data()
  #_[utterances=["eat some data","more data eating..."]]
  #_[preprocessed=["eat some data","more data eating ..."]]
  #[id=1000] #[click_count=0] #[like_count=0]
  #[name="EatData"];
  query (p_size : Measure(byte)) = @org.thingpedia.builtin.test.get_data(size=p_size)
  #_[utterances=["get \${p_size} of data"]]
  #_[preprocessed=["get \${p_size} of data"]]
  #[id=1001] #[click_count=7] #[like_count=0]
  #[name="GenDataWithSize"];
  program = monitor(@org.thingpedia.builtin.test.get_data()) => @org.thingpedia.builtin.test.eat_data()
  #_[utterances=["keep eating data!","keep eating data! (v2)"]]
  #_[preprocessed=["keep eating data !","keep eating data ! -lrb- v2 -rrb-"]]
  #[id=1002] #[click_count=0] #[like_count=0]
  #[name="GenDataThenEatData"];
  query = @org.thingpedia.builtin.test.get_data()
  #_[utterances=["more data genning..."]]
  #_[preprocessed=["more data genning ..."]]
  #[id=1005] #[click_count=0] #[like_count=0]
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

    assert.strictEqual(await ttRequest('/examples/search?q=data'), `dataset @org.thingpedia.dynamic.by_key.data
#[language="en"] {
  action = @org.thingpedia.builtin.test.eat_data()
  #_[utterances=["eat some data","more data eating..."]]
  #_[preprocessed=["eat some data","more data eating ..."]]
  #[id=1000] #[click_count=0] #[like_count=0]
  #[name="EatData"];
  query (p_size : Measure(byte)) = @org.thingpedia.builtin.test.get_data(size=p_size)
  #_[utterances=["get \${p_size} of data"]]
  #_[preprocessed=["get \${p_size} of data"]]
  #[id=1001] #[click_count=7] #[like_count=0]
  #[name="GenDataWithSize"];
  program = monitor(@org.thingpedia.builtin.test.get_data()) => @org.thingpedia.builtin.test.eat_data()
  #_[utterances=["keep eating data!","keep eating data! (v2)"]]
  #_[preprocessed=["keep eating data !","keep eating data ! -lrb- v2 -rrb-"]]
  #[id=1002] #[click_count=0] #[like_count=0]
  #[name="GenDataThenEatData"];
  query = @org.thingpedia.builtin.test.get_data()
  #_[utterances=["more data genning..."]]
  #_[preprocessed=["more data genning ..."]]
  #[id=1005] #[click_count=0] #[like_count=0]
  #[name="GenData"];
}`);
}

async function testGetCommands() {
    const TEST_DATA = [{
        "id":999,
        "language":"en",
        "type":"commandpedia",
        "utterance":"every day at 9:00 AM set my laptop background to pizza images",
        "preprocessed":"every day at TIME_0 set my laptop background to pizza images",
        "target_code":"( attimer time = TIME_0 ) join ( @com.bing.image_search param:query:String = \" pizza \" ) => @org.thingpedia.builtin.thingengine.gnome.set_background on  param:picture_url:Entity(tt:picture) = param:picture_url:Entity(tt:picture)",
        "click_count":8,
        "like_count": 1,
        "liked": true,
        "is_base": 0,
        "owner_name":"bob",
        "devices":["com.bing","org.thingpedia.builtin.thingengine.gnome"]
    },
    {
      "id": 1001,
      "language": "en",
      "type": "thingpedia",
      "utterance": "show me get ____ of data",
      "preprocessed": "get ${p_size} of data",
      "target_code": "query (p_size : Measure(byte)) := @org.thingpedia.builtin.test.get_data(size=p_size);",
      "click_count": 7,
      "like_count": 0,
      "liked": false,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.test"
      ]
    },
    {
      "id": 234,
      "language": "en",
      "type": "thingpedia",
      "utterance": "show me images from bing matching ____ larger than ____ x ____",
      "preprocessed": "images from bing matching ${p_query} larger than ${p_width} x ${p_height}",
      "target_code": "query (p_query : String, p_width : Number, p_height : Number) = @com.bing.image_search(query=p_query) filter height >= p_height && width >= p_width;",
      "click_count": 1,
      "like_count": 0,
      "liked": false,
      "is_base": 1,
      "owner_name": "Test Org",
      "devices": [
        "com.bing"
      ]
    },
    {
      "id": 27,
      "language": "en",
      "type": "thingpedia",
      "utterance": "open the file at ____",
      "preprocessed": "open the file at ${p_url}",
      "target_code": "action (p_url : Entity(tt:url)) = @org.thingpedia.builtin.thingengine.builtin.open_url(url=p_url);",
      "click_count": 1,
      "like_count": 0,
      "liked": false,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.builtin"
      ]
    },
    {
      "id": 209,
      "language": "en",
      "type": "thingpedia",
      "utterance": "show me texts i received in the last hour",
      "preprocessed": "texts i received in the last hour",
      "target_code": "query = @org.thingpedia.builtin.thingengine.phone.sms() filter date >= $start_of(h);",
      "click_count": 1,
      "like_count": 0,
      "liked": false,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.phone"
      ]
    },
    {
      "id": 60,
      "language": "en",
      "type": "thingpedia",
      "utterance": "my ____ address is ____",
      "preprocessed": "my ${p_type} address is ${p_location}",
      "target_code": "program (p_type : Enum(current, home, work), p_location : Location) = @org.thingpedia.builtin.thingengine.builtin.set_location(location=p_location, type=p_type);",
      "click_count": 1,
      "like_count": 0,
      "liked": false,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.builtin"
      ]
    },
    {
      "id": 216,
      "language": "en",
      "type": "thingpedia",
      "utterance": "call somebody",
      "preprocessed": "call somebody",
      "target_code": "action = @org.thingpedia.builtin.thingengine.phone.call();",
      "click_count": 1,
      "like_count": 0,
      "liked": false,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.phone"
      ]
    },
    {
      "id": 78,
      "language": "en",
      "type": "thingpedia",
      "utterance": "How are u feeling today?",
      "preprocessed": "how are u feeling today ?",
      "target_code": "program = @org.thingpedia.builtin.thingengine.builtin.faq_reply(question=enum about_almond_how_are_you);",
      "click_count": 1,
      "like_count": 0,
      "liked": false,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.builtin"
      ]
    },
    {
      "id": 143,
      "language": "en",
      "type": "thingpedia",
      "utterance": "Kill yourself",
      "preprocessed": "kill yourself",
      "target_code": "program = @org.thingpedia.builtin.thingengine.builtin.faq_reply(question=enum abusive);",
      "click_count": 1,
      "like_count": 0,
      "liked": false,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.builtin"
      ]
    },
    {
       click_count: 1,
       devices: [
         'org.thingpedia.builtin.thingengine.builtin'
       ],
       id: 71,
       is_base: 1,
       language: 'en',
       like_count: 0,
       liked: false,
       owner_name: 'Site Administration',
       preprocessed: 'how are you ?',
       target_code: 'program = @org.thingpedia.builtin.thingengine.builtin.faq_reply(question=enum about_almond_how_are_you);',
       type: 'thingpedia',
       utterance: 'How are you?'
    }
  ];

    // first test /thingpedia/api/commands/all: there should be no `liked` field
    assert.deepStrictEqual(await request('/commands/all'), {
        result: 'ok',
        data: TEST_DATA.map((command) => {
            const clone = {};
            Object.assign(clone, command);
            delete clone.liked;
            return clone;
        })
    });

    // now test /thingpedia/commands/all with valid cookie
    assert.deepStrictEqual(JSON.parse(await Tp.Helpers.Http.get(Config.SERVER_ORIGIN + '/thingpedia/commands/all', {
        accept: 'application/json',
        extraHeaders: {
            'Cookie': process.env.COOKIE,
        }
    })), {
        result: 'ok',
        data: TEST_DATA
    });

    assert.deepStrictEqual(await request('/commands/search?q=laptop'), {
        result: 'ok',
        data: [
    {
      "id": 999,
      "language": "en",
      "type": "commandpedia",
      "utterance": "every day at 9:00 AM set my laptop background to pizza images",
      "preprocessed": "every day at TIME_0 set my laptop background to pizza images",
      "target_code": "( attimer time = TIME_0 ) join ( @com.bing.image_search param:query:String = \" pizza \" ) => @org.thingpedia.builtin.thingengine.gnome.set_background on  param:picture_url:Entity(tt:picture) = param:picture_url:Entity(tt:picture)",
      "click_count": 8,
      "like_count": 1,
      "is_base": 0,
      "owner_name": "bob",
      "devices": [
        "com.bing",
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 183,
      "language": "en",
      "type": "thingpedia",
      "utterance": "show me a screenshot of my laptop",
      "preprocessed": "a screenshot of my laptop",
      "target_code": "query = @org.thingpedia.builtin.thingengine.gnome.get_screenshot();",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 175,
      "language": "en",
      "type": "thingpedia",
      "utterance": "create a file named ____ on my laptop",
      "preprocessed": "create a file named ${p_file_name:const} on my laptop",
      "target_code": "action (p_file_name : Entity(tt:path_name)) = @org.thingpedia.builtin.thingengine.gnome.create_file(file_name=p_file_name);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 174,
      "language": "en",
      "type": "thingpedia",
      "utterance": "turn ____ my laptop",
      "preprocessed": "turn ${p_power} my laptop",
      "target_code": "action (p_power : Enum(on, off)) = @org.thingpedia.builtin.thingengine.gnome.set_power(power=p_power);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 182,
      "language": "en",
      "type": "thingpedia",
      "utterance": "delete a file from my laptop",
      "preprocessed": "delete a file from my laptop",
      "target_code": "action = @org.thingpedia.builtin.thingengine.gnome.delete_file();",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 181,
      "language": "en",
      "type": "thingpedia",
      "utterance": "use ____ as the background of my laptop",
      "preprocessed": "use ${p_picture_url} as the background of my laptop",
      "target_code": "action (p_picture_url : Entity(tt:picture)) = @org.thingpedia.builtin.thingengine.gnome.set_background(picture_url=p_picture_url);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 185,
      "language": "en",
      "type": "thingpedia",
      "utterance": "save a screenshot of my laptop",
      "preprocessed": ", save a screenshot of my laptop",
      "target_code": "query = @org.thingpedia.builtin.thingengine.gnome.get_screenshot();",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 171,
      "language": "en",
      "type": "thingpedia",
      "utterance": "lock my laptop",
      "preprocessed": "lock my laptop",
      "target_code": "action = @org.thingpedia.builtin.thingengine.gnome.lock();",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 180,
      "language": "en",
      "type": "thingpedia",
      "utterance": "set the background of my laptop to ____",
      "preprocessed": "set the background of my laptop to ${p_picture_url}",
      "target_code": "action (p_picture_url : Entity(tt:picture)) = @org.thingpedia.builtin.thingengine.gnome.set_background(picture_url=p_picture_url);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 179,
      "language": "en",
      "type": "thingpedia",
      "utterance": "change the background on my laptop",
      "preprocessed": "change the background on my laptop",
      "target_code": "action = @org.thingpedia.builtin.thingengine.gnome.set_background();",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 176,
      "language": "en",
      "type": "thingpedia",
      "utterance": "create a file named ____ on my laptop containing ____",
      "preprocessed": "create a file named ${p_file_name:const} on my laptop containing ${p_contents}",
      "target_code": "action (p_file_name : Entity(tt:path_name), p_contents : String) = @org.thingpedia.builtin.thingengine.gnome.create_file(contents=p_contents, file_name=p_file_name);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 164,
      "language": "en",
      "type": "thingpedia",
      "utterance": "open ____ on my laptop",
      "preprocessed": "open ${p_app_id} on my laptop",
      "target_code": "action (p_app_id : Entity(org.freedesktop:app_id)) = @org.thingpedia.builtin.thingengine.gnome.open_app(app_id=p_app_id);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 178,
      "language": "en",
      "type": "thingpedia",
      "utterance": "delete the file named ____ from my laptop",
      "preprocessed": "delete the file named ${p_file_name:const} from my laptop",
      "target_code": "action (p_file_name : Entity(tt:path_name)) = @org.thingpedia.builtin.thingengine.gnome.delete_file(file_name=p_file_name);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 184,
      "language": "en",
      "type": "thingpedia",
      "utterance": "take a screenshot of my laptop",
      "preprocessed": ", take a screenshot of my laptop",
      "target_code": "query = @org.thingpedia.builtin.thingengine.gnome.get_screenshot();",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 168,
      "language": "en",
      "type": "thingpedia",
      "utterance": "open ____ with ____ on my laptop",
      "preprocessed": "open ${p_url} with ${p_app_id} on my laptop",
      "target_code": "action (p_url : Entity(tt:url), p_app_id : Entity(org.freedesktop:app_id)) = @org.thingpedia.builtin.thingengine.gnome.open_app(app_id=p_app_id, url=p_url);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 177,
      "language": "en",
      "type": "thingpedia",
      "utterance": "delete ____ from my laptop",
      "preprocessed": "delete ${p_file_name} from my laptop",
      "target_code": "action (p_file_name : Entity(tt:path_name)) = @org.thingpedia.builtin.thingengine.gnome.delete_file(file_name=p_file_name);",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    },
    {
      "id": 172,
      "language": "en",
      "type": "thingpedia",
      "utterance": "activate the lock screen on my laptop",
      "preprocessed": "activate the lock screen on my laptop",
      "target_code": "action = @org.thingpedia.builtin.thingengine.gnome.lock();",
      "click_count": 1,
      "like_count": 0,
      "is_base": 1,
      "owner_name": "Site Administration",
      "devices": [
        "org.thingpedia.builtin.thingengine.gnome"
      ]
    }
  ]
    });

    assert.deepStrictEqual(await request('/commands/search?q=foo'), {
        result: 'ok',
        data: [] });
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

async function testGetDevicePackage() {
    let source = await streamRequest('/devices/package/com.bing');
    await new Promise((resolve, reject) => {
        source.on('error', reject);
        source.on('end', resolve);
        source.resume();
    });

    source = await streamRequest(`/devices/package/com.bing?developer_key=${process.env.DEVELOPER_KEY}`);
    await new Promise((resolve, reject) => {
        source.on('error', reject);
        source.on('end', resolve);
        source.resume();
    });

    source = await streamRequest(`/devices/package/com.bing?developer_key=${process.env.ROOT_DEVELOPER_KEY}`);
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

    assert.deepStrictEqual(await request(
        `/devices/setup/org.thingpedia.builtin.test.invisible?developer_key=${process.env.ROOT_DEVELOPER_KEY}`), {
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

    assert.deepStrictEqual(await request(
        `/devices/setup/org.thingpedia.builtin.test.adminonly?developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: {
            'org.thingpedia.builtin.test.adminonly': {
                type: 'multiple',
                choices: []
            }
        }
    });

    assert.deepStrictEqual(await request(
        `/devices/setup/org.thingpedia.builtin.test.adminonly?developer_key=${process.env.ROOT_DEVELOPER_KEY}`), {
        result: 'ok',
        data: {
            'org.thingpedia.builtin.test.adminonly': {
                type: 'none',
                text: "Admin-only Device",
                category: 'system',
                kind: 'org.thingpedia.builtin.test.adminonly'
            }
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
        'online': [],
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
        'online': [],
        'physical': ['org.thingpedia.builtin.thingengine.phone',
                     'org.thingpedia.builtin.thingengine.home',
                     'org.thingpedia.builtin.thingengine.gnome',
                     'org.thingpedia.builtin.bluetooth.generic'],
        'data': ['com.bing',
                 'org.thingpedia.builtin.thingengine.builtin'],
        'system': ['org.thingpedia.builtin.test',
                   'org.thingpedia.builtin.thingengine',
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
            assert.strictEqual(typeof device.website, 'string');
            assert.strictEqual(typeof device.repository, 'string');
            assert.strictEqual(typeof device.issue_tracker, 'string');
            assert.strictEqual(typeof device.license, 'string');
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
            subcategory: 'service',
            website: 'https://www.bing.com',
            repository: 'https://github.com/stanford-oval/thingpedia-common-devices',
            issue_tracker: 'https://github.com/stanford-oval/thingpedia-common-devices/issues',
            license: 'GPL-3.0'
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
            subcategory: 'service',
            website: '',
            repository: '',
            issue_tracker: '',
            license: 'GPL-3.0'
        }]
    });

    assert.deepStrictEqual(await request(`/devices/search?q=bing+invisible&developer_key=${process.env.DEVELOPER_KEY}`), {
        result: 'ok',
        data: []
    });

    assert.deepStrictEqual(await request(`/devices/search?q=invisible&developer_key=${process.env.ROOT_DEVELOPER_KEY}`), {
        result: 'ok',
        data: [{
            primary_kind: 'org.thingpedia.builtin.test.invisible',
            name: 'Invisible Device',
            description: 'This device is owned by Bob. It was not approved.',
            category: 'system',
            subcategory: 'service',
            website: '',
            repository: '',
            issue_tracker: '',
            license: 'GPL-3.0'
        }]
    });

    assert.deepStrictEqual(await request(`/devices/search?q=bing+invisible&developer_key=${process.env.ROOT_DEVELOPER_KEY}`), {
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

async function testGetEntityList() {
    assert.deepStrictEqual(await request('/entities/all'),
        {"result":"ok",
        "data":[
        {
            "type":"com.spotify:playable",
            "name":"Playable item in Spotify",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": null
        },{
            "type":"com.spotify:song",
            "name":"Song in Spotify",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": "com.spotify:playable",
        },{
            "type":"org.freedesktop:app_id",
            "name":"Freedesktop App Identifier",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": null
        },{
            "type":"tt:command_id",
            "name":"Thingpedia Command ID",
            "is_well_known":0,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:iso_lang_code",
            "name":"Language Identifier",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": null
        },{
            "type":"tt:stock_id",
            "name":"Company Stock ID",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": null
        },{
            "type":"tt:timezone",
            "name":"Timezone Identifier",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": null
        },{
            "type":"tt:contact",
            "name":"Contact Identity",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:contact_name",
            "name":"Contact Name",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:device",
            "name":"Device Name",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:email_address",
            "name":"Email Address",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:flow_token",
            "name":"Flow Identifier",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:function",
            "name":"Function Name",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:hashtag",
            "name":"Hashtag",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:path_name",
            "name":"Unix Path",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:phone_number",
            "name":"Phone Number",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:picture",
            "name":"Picture",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:program",
            "name":"Program",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:url",
            "name":"URL",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
        },{
            "type":"tt:username",
            "name":"Username",
            "is_well_known":1,
            "has_ner_support":0,
            "subtype_of": null
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

async function testGetStringList() {
    assert.deepStrictEqual(await request('/strings/all'), {
        "result": "ok",
            "data": [
            {
                "type": "tt:location",
                "name": "Cities, points on interest and addresses",
                "license": "free-copyleft",
                "attribution": "Copyright © OpenStreetMap contributors <https://www.openstreemap.org/copyright>. Distributed under the Open Data Commons Open Database License."
            },
            {
                "type": "tt:long_free_text",
                "name": "General Text (paragraph)",
                "license": "non-commercial",
                "attribution": "The Brown Corpus <http://www.hit.uib.no/icame/brown/bcm.html>"
            },
            {
                "type": "tt:path_name",
                "name": "File and directory names",
                "license": "public-domain",
                "attribution": ""
            },
            {
                "type": "tt:person_first_name",
                "name": "First names of people",
                "license": "public-domain",
                "attribution": "United States Census and Social Security data"
            },
            {
                "type": "tt:search_query",
                "name": "Web Search Query",
                "license": "public-domain",
                "attribution": ""
            },
            {
                "type": "tt:short_free_text",
                "name": "General Text (short phrase)",
                "license": "non-commercial",
                "attribution": "The Brown Corpus <http://www.hit.uib.no/icame/brown/bcm.html>"
            },
            {
                "type": "tt:word",
                "name": "Individual words",
                "license": "public-domain",
                "attribution": ""
            }
        ]
    });
}

async function testGetStringValues() {
    await assertHttpError(request(`/strings/list/tt:path_name`), 403);

    assert.deepStrictEqual(await request(`/strings/list/tt:path_name?developer_key=${process.env.DEVELOPER_KEY}`), {
        "result": "ok",
        "data": [
        {
            "value": "desktop",
            "preprocessed": "desktop",
            "weight": 1000
        },
        {
            "value": "my documents",
            "preprocessed": "my documents",
            "weight": 1000
        },
        {
            "value": "my network",
            "preprocessed": "my network",
            "weight": 1000
        },
        {
            "value": "pictures",
            "preprocessed": "pictures",
            "weight": 1000
        },
        {
            "value": "android",
            "preprocessed": "android",
            "weight": 1000
        },
        {
            "value": "ios",
            "preprocessed": "ios",
            "weight": 1000
        },
        {
            "value": "files",
            "preprocessed": "files",
            "weight": 1000
        },
        {
            "value": "downloads",
            "preprocessed": "downloads",
            "weight": 1000
        },
        {
            "value": "music",
            "preprocessed": "music",
            "weight": 1000
        },
        {
            "value": "videos",
            "preprocessed": "videos",
            "weight": 1000
        }
    ]});

    await assertHttpError(request(`/strings/list/tt:invalid?developer_key=${process.env.DEVELOPER_KEY}`), 404);
}

async function testLookupLocation() {
    const result = await request('/locations/lookup?q=seattle');

    assert.strictEqual(result.result, 'ok');
    assert(Array.isArray(result.data));
    console.log(result.data);

    let found = false;
    for (let loc of result.data) {
        assert.strictEqual(typeof loc.latitude, 'number');
        assert.strictEqual(typeof loc.longitude, 'number');
        assert.strictEqual(typeof loc.display, 'string');
        assert.strictEqual(typeof loc.canonical, 'string');
        assert.strictEqual(typeof loc.rank, 'number');
        assert.strictEqual(typeof loc.importance, 'number');

        if (loc.display === 'Seattle, Washington') {
            assert(Math.abs(loc.latitude - 47.6038321) < 1e-6);
            assert(Math.abs(loc.longitude - -122.3300624) < 1e-6);
            assert.strictEqual(loc.canonical, 'seattle washington');
            assert.strictEqual(loc.rank, 16);
            found = true;
        }
    }
    assert(found);
}

async function getAccessToken(session) {
    return JSON.parse(await sessionRequest('/user/token', 'POST', '', session, {
        accept: 'application/json',
    })).token;
}

function createUpload(file, data) {
    const fd = new FormData();

    if (file)
        fd.append('upload', file, { filename: 'entity.csv', contentType: 'text/csv;charset=utf8' });
    for (let key in data)
        fd.append(key, data[key]);
    return fd;
}

const ENTITY_FILE = `one,The First Entity
two,The Second Entity
three,The Third Entity
`;


async function testEntityUpload() {
    await startSession();
    const bob = await login('bob', '12345678');
    const bob_token = await getAccessToken(bob);
    const root = await login('root', 'rootroot');
    const root_token = await getAccessToken(root);

    await assertHttpError(
        Tp.Helpers.Http.post(THINGPEDIA_URL + '/entities/create', '', {
            'Content-Type': 'multipart/form-data'
        }),
        401,
        'Authentication required.'
    );

    const fd0 = createUpload(ENTITY_FILE, {
        entity_id: 'org.thingpedia.test:api_entity_test1',
        entity_name: 'Test Entity',
        no_ner_support: '',
    });
    await assertHttpError(
        Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/entities/create', fd0, {
            dataContentType:  'multipart/form-data; boundary=' + fd0.getBoundary(),
            auth: 'Bearer ' + bob_token
        }),
        403,
        'The prefix of the entity ID must correspond to the ID of a Thingpedia device owned by your organization.'
    );

    const fd1 = createUpload(ENTITY_FILE, {
        entity_id: 'org.thingpedia.test:api_entity_test1',
        entity_name: 'Test Entity',
        no_ner_support: '1'
    });
    const r1 = await Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/entities/create', fd1, {
        dataContentType: 'multipart/form-data; boundary=' + fd1.getBoundary(),
        auth: 'Bearer ' + root_token
    });
    assert.deepStrictEqual(JSON.parse(r1), { result: 'ok' });

    const fd2 = createUpload(ENTITY_FILE, {
        entity_id: 'org.thingpedia.test:api_entity_test2',
        entity_name: 'Test Entity'
    });
    const r2 = await Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/entities/create', fd2, {
        dataContentType: 'multipart/form-data; boundary=' + fd2.getBoundary(),
        auth: 'Bearer ' + root_token
    });
    assert.deepStrictEqual(JSON.parse(r2), { result: 'ok' });
}

const STRING_FILE = `aaaa\t1.0
bbbb\t5.0
cccc\t
dddd\t1.0`;

const STRING_FILE2 = `Aaaa\taaaa\t1.0
BBBB\t5.0
CCcc\tcccc\t
DDDD\tdddd\t1.0`;

async function testStringUpload() {
    await startSession();
    const bob = await login('bob', '12345678');
    const bob_token = await getAccessToken(bob);
    const root = await login('root', 'rootroot');
    const root_token = await getAccessToken(root);

    await assertHttpError(
        Tp.Helpers.Http.post(THINGPEDIA_URL + '/strings/upload', '', {
            'Content-Type': 'multipart/form-data'
        }),
        401,
        'Authentication required.'
    );

    const fd0 = createUpload(STRING_FILE, {
        type_name: 'org.thingpedia.test:api_string_test1',
        name: 'Test String Three',
        license: 'proprietary',
        preprocessed:'1'
    });
    await assertHttpError(
        Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/strings/upload', fd0, {
            dataContentType:  'multipart/form-data; boundary=' + fd0.getBoundary(),
            auth: 'Bearer ' + bob_token
        }),
        403,
        'The prefix of the dataset ID must correspond to the ID of a Thingpedia device owned by your organization.'
    );

    const fd1 = createUpload(STRING_FILE, {
        type_name: 'org.thingpedia.test:api_string_test1',
        name: 'Test String Three',
        license: 'proprietary',
        preprocessed:'1'
    });
    const r1 = await Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/strings/upload', fd1, {
        dataContentType: 'multipart/form-data; boundary=' + fd1.getBoundary(),
        auth: 'Bearer ' + root_token
    });
    assert.deepStrictEqual(JSON.parse(r1), { result: 'ok' });

    const fd2 = createUpload(STRING_FILE, {
        type_name: 'org.thingpedia.test:api_string_test2',
        name: 'Test String Three',
        license: 'proprietary',
        preprocessed:'1'
    });
    const r2 = await Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/strings/upload', fd2, {
        dataContentType: 'multipart/form-data; boundary=' + fd2.getBoundary(),
        auth: 'Bearer ' + root_token
    });
    assert.deepStrictEqual(JSON.parse(r2), { result: 'ok' });

    const fd3 = createUpload(STRING_FILE2, {
        type_name: 'org.thingpedia.test:api_string_test4',
        name: 'Test String Four',
        license: 'free-copyleft',
    });
    const r3 = await Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/strings/upload', fd3, {
        dataContentType: 'multipart/form-data; boundary=' + fd3.getBoundary(),
        auth: 'Bearer ' + root_token
    });
    assert.deepStrictEqual(JSON.parse(r3), { result: 'ok' });

     assert.deepStrictEqual(await request(`/strings/list/org.thingpedia.test:api_string_test4?developer_key=${process.env.DEVELOPER_KEY}`), {
        "result": "ok",
        "data": [
        {
            "value": "Aaaa",
            "preprocessed": "aaaa",
            "weight": 1
        },
        {
            "value": "BBBB",
            "preprocessed": "bbbb",
            "weight": 5
        },
        {
            "value": "CCcc",
            "preprocessed": "cccc",
            "weight": 1
        },
        {
            "value": "DDDD",
            "preprocessed": "dddd",
            "weight": 1
        },
    ]});
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

const NEW_DEVICE1_CLASS = `
class @org.thingpedia.test.newdevice1 {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  query foo(out text : String)
  #_[confirmation="the foos"];
}
`;
const NEW_DEVICE1_DATASET = `
dataset @org.thingpedia.test.newdevice1 language "en" {
}
`;
const NEW_DEVICE1_ICON = fs.readFileSync(path.resolve(path.dirname(module.filename), './data/com.bing.png'));

const NEW_DEVICE1_CODE = `
"use strict";
const Tp = require('thingpedia');
module.exports = class TestDevice extends Tp.BaseDevice {
    get_foo() {
        return [{ text: "foo" }];
    }
};
`;

const NEW_DEVICE_WITH_ENTITY_CLASS = `
class @org.thingpedia.test.newdevice_withentity {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  entity foo #_[description="Some foo"];
  entity bar extends foo #_[description="Some bar"];
  entity baz extends ^^tt:stock_id #_[description="Some baz"];

  query foo(out text : String)
  #_[confirmation="the foos"];
}
`;
const NEW_DEVICE_WITH_ENTITY_DATASET = `
dataset @org.thingpedia.test.newdevice_withentity language "en" {
}
`;

const BANG_CLASS_FULL = `class @com.bing
#_[name="Bang Search"]
#_[description="Search the web with Bang"]
#_[canonical="bang search"]
#[version=1]
#[package_version=1] {
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
  #_[canonical="web search on bing"]
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
  #_[canonical="image search on bing"]
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
}`;

async function testCreateDevice() {
    await startSession();
    const bob = await login('bob', '12345678');
    const bob_token = await getAccessToken(bob);

    function createUpload(zipfile, jsfile, icon, data) {
        const fd = new FormData();

        if (zipfile)
            fd.append('zipfile', zipfile, { filename: 'device.zip', contentType: 'application/zip' });
        if (jsfile) // note: the js file goes in the same spot at the zip file, and the server disambiguates based on file extension
            fd.append('zipfile', jsfile, { filename: 'device.js', contentType: 'application/javascript' });
        if (icon)
            fd.append('icon', icon, { filename: 'icon.png', contentType: 'image/png' });
        for (let key in data)
            fd.append(key, data[key]);
        return fd;
    }
    function tryUpload(zipfile, jsfile, icon, data) {
        const fd = createUpload(zipfile, jsfile, icon, data);
        return Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/devices/create', fd, {
            dataContentType:  'multipart/form-data; boundary=' + fd.getBoundary(),
            auth: 'Bearer ' + bob_token
        });
    }

    await assertHttpError(
        Tp.Helpers.Http.post(THINGPEDIA_URL + '/devices/create', '', {
            'Content-Type': 'multipart/form-data'
        }),
        401,
        'Authentication required.'
    );

    await assertHttpError(tryUpload(null, null, null, {
        primary_kind: 'org.thingpedia.test.newdevice1',
        name: 'New Test Device',
        description: 'Yet another test device (can\'t have too many of those)',
        license: 'CC0',
        license_gplcompatible: '1',
        subcategory: 'service',
        code: NEW_DEVICE1_CLASS,
        dataset: NEW_DEVICE1_DATASET,
    }), 400, 'An icon must be specified for new devices');

    await assertHttpError(tryUpload(null, null, NEW_DEVICE1_ICON, {
        primary_kind: 'org.thingpedia.test.newdevice1',
        name: 'New Test Device',
        description: 'Yet another test device (can\'t have too many of those)',
        license: 'CC0',
        license_gplcompatible: '1',
        subcategory: 'service',
        code: NEW_DEVICE1_CLASS,
        dataset: NEW_DEVICE1_DATASET,
    }), 400, 'Invalid zip file');

    await assertHttpError(tryUpload(null, null, NEW_DEVICE1_ICON, {
        primary_kind: 'org.thingpedia.test.newdevice1',
        name: 'New Test Device',
        description: 'Yet another test device (can\'t have too many of those)',
        license: 'CC0',
        license_gplcompatible: '1',
        subcategory: 'service',
        code: `class @foo.bad {}`,
        dataset: NEW_DEVICE1_DATASET,
    }), 400, 'Invalid manifest file: must contain exactly one class, with the same identifier as the device');

    await tryUpload(null, NEW_DEVICE1_CODE, NEW_DEVICE1_ICON, {
        primary_kind: 'org.thingpedia.test.newdevice1',
        name: 'New Test Device',
        description: 'Yet another test device (can\'t have too many of those)',
        license: 'CC0',
        license_gplcompatible: '1',
        subcategory: 'service',
        code: NEW_DEVICE1_CLASS,
        dataset: NEW_DEVICE1_DATASET,
    });

    await assertHttpError(ttRequest(`/devices/code/org.thingpedia.test.newdevice1`), 404);
    const manifest = await ttRequest(`/devices/code/org.thingpedia.test.newdevice1?developer_key=${process.env.DEVELOPER_KEY}`);
    assert.strictEqual(manifest, `class @org.thingpedia.test.newdevice1
#_[name="New Test Device"]
#_[description="Yet another test device (can't have too many of those)"]
#_[canonical="new test device"]
#[version=0]
#[package_version=0] {
  import loader from @org.thingpedia.v2();

  import config from @org.thingpedia.config.none();

  query foo(out text : String
            #_[canonical="text"])
  #_[confirmation="the foos"]
  #_[canonical="foo on new test device"]
  #[minimal_projection=[]]
  #[confirm=false];
}`);

    let source = await streamRequest(`/devices/package/org.thingpedia.test.newdevice1?developer_key=${process.env.DEVELOPER_KEY}`);
    const buffer = await new Promise((resolve, reject) => {
        let buffers = [];
        let buflen = 0;
        source.on('data', (buf) => {
            buffers.push(buf);
            buflen += buf.length;
        });
        source.on('error', reject);
        source.on('end', () => resolve(Buffer.concat(buffers, buflen)));
        source.resume();
    });
    const zipFile = new JSZip;
    await zipFile.loadAsync(buffer, { checkCRC32: true });
    const packageJson = JSON.parse(await zipFile.file('package.json').async('string'));

    assert.deepStrictEqual(packageJson, {
        name: 'org.thingpedia.test.newdevice1',
        author: 'bob@thingpedia.stanford.edu',
        main: 'index.js',
        'thingpedia-version': 0
    });

    await tryUpload(null, NEW_DEVICE1_CODE, NEW_DEVICE1_ICON, {
        primary_kind: 'org.thingpedia.test.newdevice_withentity',
        name: 'New Test Device With Entity',
        description: 'Yet another test device - this one has an entity',
        license: 'CC0',
        license_gplcompatible: '1',
        subcategory: 'service',
        code: NEW_DEVICE_WITH_ENTITY_CLASS,
        dataset: NEW_DEVICE_WITH_ENTITY_DATASET,
    });

    const newEntities = (await request('/entities/all')).data.filter((e) => e.type.startsWith('org.thingpedia.test.newdevice_withentity:'));
    assert.deepStrictEqual(newEntities,[
        {
            "type":"org.thingpedia.test.newdevice_withentity:bar",
            "name":"Some bar",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": "org.thingpedia.test.newdevice_withentity:foo"
        },
        {
            "type":"org.thingpedia.test.newdevice_withentity:baz",
            "name":"Some baz",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": "tt:stock_id"
        },
        {
            "type":"org.thingpedia.test.newdevice_withentity:foo",
            "name":"Some foo",
            "is_well_known":0,
            "has_ner_support":1,
            "subtype_of": null
        }
    ]);
}

const BING_DATASET = `
dataset @com.bing language "en" {
    query (p_query :String) := @com.bing.web_search(query=p_query)
    #_[utterances=["\${p_query:const} on bing","bing $p_query","websites matching $p_query","web sites matching $p_query"]];

    query := @com.bing.web_search(query=$?)
    #_[utterances=[", search on bing",", bing search",", web search"]];

    query (p_query :String) := @com.bing.image_search(query=p_query)
    #_[utterances=["\${p_query:const} images on bing","images matching $p_query from bing"]];

    query := @com.bing.image_search(query=$?)
    #_[utterances=[", search images on bing",", bing image search",", image search"]];

    query (p_query :String, p_width :Number, p_height :Number) := (@com.bing.image_search(query=p_query)), (width == p_width && height == p_height)
    #_[utterances=["images from bing matching $p_query with size $p_width x $p_height"]];

    query (p_query :String, p_width :Number, p_height :Number) := (@com.bing.image_search(query=p_query)), (width >= p_width && height >= p_height)
    #_[utterances=["images from bing matching $p_query larger than $p_width x $p_height"]];

    query (p_query :String, p_width :Number) := (@com.bing.image_search(query=p_query)), width >= p_width
    #_[utterances=["images from bing matching $p_query wider than $p_width"]];

    query (p_query :String, p_width :Number, p_height :Number) := (@com.bing.image_search(query=p_query)), (width >= p_width || height >= p_height)
    #_[utterances=["images from bing matching $p_query larger than $p_width x $p_height in either dimension"]];

    query (p_query :String, p_height :Number) := (@com.bing.image_search(query=p_query)), height >= p_height
    #_[utterances=["images from bing matching $p_query taller than $p_height"]];

    query (p_query :String, p_width :Number, p_height :Number) := (@com.bing.image_search(query=p_query)), (width <= p_width && height <= p_height)
    #_[utterances=["images from bing matching $p_query smaller than $p_width x $p_height"]];
  }
`;

async function testEditDevice() {
    await startSession();
    const bob = await login('bob', '12345678');
    const bob_token = await getAccessToken(bob);

    function createUpload(zipfile, jsfile, icon, data) {
        const fd = new FormData();

        if (zipfile)
            fd.append('zipfile', zipfile, { filename: 'device.zip', contentType: 'application/zip' });
        if (jsfile) // note: the js file goes in the same spot at the zip file, and the server disambiguates based on file extension
            fd.append('zipfile', jsfile, { filename: 'device.js', contentType: 'application/javascript' });
        if (icon)
            fd.append('icon', icon, { filename: 'icon.png', contentType: 'image/png' });
        for (let key in data)
            fd.append(key, data[key]);
        return fd;
    }
    function tryUpload(zipfile, jsfile, icon, data) {
        const fd = createUpload(zipfile, jsfile, icon, data);
        return Tp.Helpers.Http.postStream(THINGPEDIA_URL + '/devices/create', fd, {
            dataContentType:  'multipart/form-data; boundary=' + fd.getBoundary(),
            auth: 'Bearer ' + bob_token
        });
    }

    await assertHttpError(tryUpload(null, null, null, {
        primary_kind: 'org.thingpedia.builtin.test.adminonly',
        name: 'New Test Device',
        description: 'I am taking over the Admin Only Device!',
        license: 'CC0',
        license_gplcompatible: '1',
        subcategory: 'service',
        code: NEW_DEVICE1_CLASS,
        dataset: NEW_DEVICE1_DATASET,
    }), 403, 'You do not have permission to perform the requested operation.');

    // upload nothing
    await tryUpload(null, null, null, {
        primary_kind: 'com.bing',
        // everybody knows Bing should have been called Bang
        name: 'Bang Search',
        description: 'Search the web with Bang',
        license: 'CC0',
        license_gplcompatible: '1',
        subcategory: 'service',
        code: BANG_CLASS_FULL,
        dataset: BING_DATASET,
    });

    assert.strictEqual(await ttRequest(`/devices/code/com.bing`), BING_CLASS_FULL);
    assert.strictEqual(await ttRequest(`/devices/code/com.bing?developer_key=${process.env.DEVELOPER_KEY}`), BANG_CLASS_FULL);
}


async function main() {
    await testGetSchemas();
    await testGetMetadata();
    await testGetExamplesByDevice();
    await testGetExamplesByKey();
    await testGetCommands();
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
    await testGetSnapshot();
    await testDiscovery();
    await testDeviceSearch();
    await testGetEntityList();
    await testGetEntityValues();
    await testLookupEntity();
    await testGetStringList();
    await testGetStringValues();
    await testLookupLocation();
    await testEntityUpload();
    await testStringUpload();
    await testCreateDevice();
    await testEditDevice();
}
main();
