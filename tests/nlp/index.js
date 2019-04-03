// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('./polyfill');

const assert = require('assert');
const ThingTalk = require('thingtalk');
const Gettext = require('node-gettext');

const Almond = require('almond-dialog-agent');
const Intent = Almond.Intent;
const ValueCategory = Almond.ValueCategory;
const ParserClient = Almond.ParserClient;

const AdminThingpediaClient = require('../../util/admin-thingpedia-client');
const Config = require('../../config');

const gettext = new Gettext();
gettext.setLocale('en-US');

class MockPreferences {
    constructor() {
        this._store = {};
    }

    get(name) {
        return this._store[name];
    }

    set(name, value) {
        console.log(`preferences set ${name} = ${value}`);
        this._store[name] = value;
    }
}

const mockPrefs = new MockPreferences();
mockPrefs.set('sabrina-store-log', 'no');
const schemas = new ThingTalk.SchemaRetriever(new AdminThingpediaClient(), null, true);

function candidateToString(cand) {
    if (cand.isProgram)
        return `Program(${cand.program.prettyprint(true)})`;
    else if (cand.isSetup)
        return `Setup(${cand.program.prettyprint(true)})`;
    else if (cand.isPermissionRule)
        return `PermissionRule(${cand.rule.prettyprint(true)})`;
    else
        return String(cand);
}

async function testEverything() {
    const TEST_CASES = require('./parser_test_cases');
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US', mockPrefs);

    for (let i = 0; i < TEST_CASES.length; i++) {
        const test = TEST_CASES[i];
        const analyzed = await parser.sendUtterance(test);
        assert(Array.isArray(analyzed.candidates));
        assert(analyzed.candidates.length > 0);

        let candidates = await Promise.all(analyzed.candidates.map(async (candidate, beamposition) => {
            try {
                return await Intent.parse({ code: candidate.code, entities: analyzed.entities }, schemas, analyzed, null, null);
            } catch (e) {
                return null;
            }
        }));

        candidates = candidates.filter((c) => c !== null);

        if (candidates.length === 0)
            console.log(`${i+1}: ${test} => null`);
        else
            console.log(`${i+1}: ${test} => ${candidateToString(candidates[0])}`);
    }
}

function testExpect() {
    const parser = new ParserClient(process.env.SEMPRE_URL, 'en-US', mockPrefs);

    return Promise.all([
        parser.sendUtterance('42', ValueCategory.Number),
        parser.sendUtterance('yes', ValueCategory.YesNo),
        parser.sendUtterance('21 C', ValueCategory.Measure('C')),
        parser.sendUtterance('69 F', ValueCategory.Measure('C')),
    ]);
}

async function testMultipleChoice(text, expected) {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US', mockPrefs);

    const analyzed = await parser.sendUtterance(text, ValueCategory.MultipleChoice,
        [{ title: 'choice number one' }, { title: 'choice number two' }]);

    assert.deepStrictEqual(analyzed.entities, {});
    assert.deepStrictEqual(analyzed.candidates[0].code, ['bookkeeping', 'choice', expected]);
}

async function testOnlineLearn() {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US', mockPrefs);

    await parser.onlineLearn('get a cat', ['now', '=>', '@com.thecatapi.get', '=>', 'notify'], 'no');

    await parser.onlineLearn('abcdef', ['now', '=>', '@com.thecatapi.get', '=>', 'notify'], 'online');
    const analyzed = await parser.sendUtterance('abcdef');

    assert.deepStrictEqual(analyzed.candidates[0], {
        score: 'Infinity',
        code: ['now', '=>', '@com.thecatapi.get', '=>', 'notify']
    });
}

async function main() {
    await testEverything();
    await testExpect();
    await testMultipleChoice('choice number one', '0');
    await testMultipleChoice('choice number two', '1');
    await testOnlineLearn();
}
module.exports = main;
if (!module.parent)
    main();
