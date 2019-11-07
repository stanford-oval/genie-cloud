// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const applyCompatibility = require('../../nlp/compat'); //(locale, results, entities, thingtalk_version)

const TEST_CASES = [
    [
    '1.0.0', {},
    '( monitor ( @com.washtingtonpost.get_article ) ) => ( @com.yandex.translate ) => notify',
    '( monitor ( @com.washtingtonpost.get_article ) ) join ( @com.yandex.translate ) => notify',
    ],

    [
    '1.7.3', {},
    '( monitor ( @com.washtingtonpost.get_article ) ) => ( @com.yandex.translate ) => notify',
    '( monitor ( @com.washtingtonpost.get_article ) ) => ( @com.yandex.translate ) => notify',
    ],

    [
    '1.7.2', {},
    'now => @org.thingpedia.weather.current param:location:Location = location: " seattle " => notify',
    'now => @org.thingpedia.weather.current param:location:Location = LOCATION_0 => notify',
    ],
    [
    '1.7.3', {},
    'now => @org.thingpedia.weather.current param:location:Location = location: " seattle " => notify',
    'now => @org.thingpedia.weather.current param:location:Location = LOCATION_0 => notify',
    ],

    [
    '1.8.0', {},
    'now => @org.thingpedia.weather.current param:location:Location = location: " seattle " => notify',
    'now => @org.thingpedia.weather.current param:location:Location = location: " seattle " => notify',
    ],
];

async function test(i) {
    console.log(`Test Case #${i+1}`);
    const [version, entities, code, expected] = TEST_CASES[i];

    const results = [{
        code: code.split(' '),
        score: 1
    }];
    await applyCompatibility('en-US', results, entities, version);

    assert.strictEqual(results[0].code.join(' '), expected);
}

async function main() {
    for (let i = 0; i < TEST_CASES[i].length; i++)
        await test(i);
}
module.exports = main;
if (!module.parent)
    main();
