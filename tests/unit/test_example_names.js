// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Tp = require('thingpedia');
const ThingTalk = require('thingtalk');
const path = require('path');

const getExampleName = require('../../util/example_names');

const _schemaRetriever = new ThingTalk.SchemaRetriever(new Tp.FileClient({
    thingpedia: path.resolve(path.dirname(module.filename), './thingpedia.tt')
}), null, true);

const TEST_CASES = [
    [`query := @com.twitter.search();`, `Search`],

    [`query (p_hashtag : Entity(tt:hashtag)) := @com.twitter.search(), contains(hashtags, p_hashtag);`, `SearchByHashtags`],

    [`query (p_author : Entity(tt:username)) := @com.twitter.search(), author == p_author;`, `SearchByAuthor`],

    [`query (p_author1 : Entity(tt:username), p_author2 : Entity(tt:username)) := @com.twitter.search(), in_array(author, [p_author1, p_author2]);`,
    `SearchByAuthor`],

    [`query () := @thermostat.get_temperature();`, 'GetTemperature'],
    [`query (p_value : Measure(C)) := @thermostat.get_temperature(), value >= p_value;`, 'GetTemperatureByValueGreaterThan'],
    [`query (p_value : Measure(C)) := @thermostat.get_temperature(), value <= p_value;`, 'GetTemperatureByValueLessThan'],
    [`stream (p_value : Measure(C)) := edge (monitor @thermostat.get_temperature()) on value <= p_value;`, 'MonitorGetTemperatureByValueLessThan'],

    [`query () := @com.twitter.search() join @com.bing.web_search();`, `SearchAndWebSearch`],
    [`query () := @com.bing.web_search();`, `WebSearch`],
    [`query () := [link] of @com.bing.web_search();`, `LinkOfWebSearch`],
    [`query (p_query : String) := @com.bing.web_search(query=p_query);`, `WebSearchWithQuery`],

    [`stream () := monitor(@com.twitter.search() join @com.bing.web_search());`, `MonitorSearchAndWebSearch`],
    [`stream () := monitor(@com.bing.web_search());`, `MonitorWebSearch`],
    [`stream () := [link] of monitor(@com.bing.web_search());`, `LinkOfMonitorWebSearch`],

    [`action () := @light-bulb.set_power();`, 'SetPower'],
    [`action (p_power : Enum(on,off)) := @light-bulb.set_power(power=p_power);`, 'SetPowerWithPower'],
    [`action () := @light-bulb.set_power(power=enum(on));`, 'SetPowerWithPowerOn'],

    [`program := now => @com.twitter.search() => @com.twitter.retweet(tweet_id=tweet_id);`, 'SearchThenRetweetWithTweetId'],
];

async function testCase(i) {
    console.log(`Test Case #${i+1}`);

    const [code, expected] = TEST_CASES[i];

    const dataset = `dataset @org.thingpedia language "en" { ${code} }`;
    const parsed = await ThingTalk.Grammar.parseAndTypecheck(dataset, _schemaRetriever, true);
    const example = parsed.datasets[0].examples[0];

    let generated;
    try {
        generated = getExampleName(example);
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
        console.error('Error', e);
        if (process.env.TEST_MODE)
            throw new Error(`testExampleNames ${i+1} FAILED`);
        return;
    }
    if (generated !== expected) {
        console.error('Test Case #' + (i+1) + ': does not match what expected');
        console.error('Expected: ' + expected);
        console.error('Generated: ' + generated);
        if (process.env.TEST_MODE)
            throw new Error(`testExampleNames ${i+1} FAILED`);
    }
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await testCase(i);
}
module.exports = main;
if (!module.parent)
    main();
