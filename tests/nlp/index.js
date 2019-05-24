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

require('../polyfill');
process.on('unhandledRejection', (up) => { throw up; });
require('../../util/config_init');
process.env.TEST_MODE = '1';

const assert = require('assert');
const ThingTalk = require('thingtalk');
const Gettext = require('node-gettext');

const Almond = require('almond-dialog-agent');
const Intent = Almond.Intent;
// FIXME
const ParserClient = require('./parserclient');

const AdminThingpediaClient = require('../../util/admin-thingpedia-client');
const db = require('../../util/db');
const Config = require('../../config');

const gettext = new Gettext();
gettext.setLocale('en-US');

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
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    for (let i = 0; i < TEST_CASES.length; i++) {
        const test = TEST_CASES[i];
        const analyzed = await parser.sendUtterance(test);
        assert(Array.isArray(analyzed.candidates));

        // everything should typecheck because the server filters server side
        let candidates = await Promise.all(analyzed.candidates.map(async (candidate, beamposition) => {
            return Intent.parse({ code: candidate.code, entities: analyzed.entities }, schemas, analyzed, null, null);
        }));

        candidates = candidates.filter((c) => c !== null);

        if (candidates.length === 0)
            console.log(`${i+1}: ${test} => null`);
        else
            console.log(`${i+1}: ${test} => ${candidateToString(candidates[0])}`);
    }
}

async function testContextual() {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    const tok1 = await parser.tokenize('1234');
    assert.deepStrictEqual(tok1, {
        tokens: ['NUMBER_0'],
        pos_tags: ['NN'],
        raw_tokens: ['1234'],
        sentiment: 'neutral',
        entities: {
            NUMBER_0: 1234
        }
    });

    const tok2 = await parser.tokenize('1234', { NUMBER_0: 1234 });
    assert.deepStrictEqual(tok2, {
        tokens: ['NUMBER_0'],
        pos_tags: ['NN'],
        raw_tokens: ['1234'],
        sentiment: 'neutral',
        entities: {
            NUMBER_0: 1234
        }
    });

    const tok3 = await parser.tokenize('1235', { NUMBER_0: 1234 });
    assert.deepStrictEqual(tok3, {
        tokens: ['NUMBER_1'],
        pos_tags: ['NN'],
        raw_tokens: ['1235'],
        sentiment: 'neutral',
        entities: {
            NUMBER_0: 1234,
            NUMBER_1: 1235
        }
    });

    const tok4 = await parser.tokenize('foo', { NUMBER_0: 1234 });
    assert.deepStrictEqual(tok4, {
        tokens: ['foo'],
        pos_tags: ['NN'],
        raw_tokens: ['foo'],
        sentiment: 'neutral',
        entities: {
            NUMBER_0: 1234,
        }
    });

    const q1 = await parser.sendUtterance('another one', {
        code: 'now => @com.thecatapi.get => notify',
        entities: {}
    });
    assert.deepStrictEqual(q1, {
        tokens: ['another', 'one'],
        entities: {},
        candidates: [{
            code: [ 'now', '=>', '@com.thecatapi.get', '=>', 'notify' ],
            score: 1
        }]
    });

    const q2 = await parser.sendUtterance('another one', {
        code: 'now => @uk.co.thedogapi.get => notify',
        entities: {}
    });
    assert.deepStrictEqual(q2, {
        tokens: ['another', 'one'],
        entities: {},
        candidates: [{
            code: [ 'now', '=>', '@uk.co.thedogapi.get', '=>', 'notify' ],
            score: 1
        }]
    });

    const q3 = await parser.sendUtterance('another one', {
        code: 'now => @com.thecatapi.get param:count:Number = NUMBER_0 => notify',
        entities: {
            NUMBER_0: 2
        }
    });
    assert.deepStrictEqual(q3, {
        tokens: ['another', 'one'],
        entities: {
            NUMBER_0: 2
        },
        candidates: [{
            // this is actually not the right answer, but this is what the model says, and the server code is correct this way
            code: [ 'now', '=>', '@com.thecatapi.get', 'param:count:Number', '=', '1', '=>', 'notify' ],
            score: 1
        }]
    });
}

async function expectAnswer(parser, input, expecting, expectedCode, expectedEntities) {
    const analyzed = await parser.sendUtterance(input, '', expecting);

    assert(Array.isArray(analyzed.candidates));
    assert(analyzed.candidates.length > 0);

    assert.strictEqual(analyzed.candidates[0].code.join(' '), expectedCode);
    assert.deepStrictEqual(analyzed.entities, expectedEntities);
}

function testExpect() {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    return Promise.all([
        expectAnswer(parser, '42', 'Number', 'bookkeeping answer NUMBER_0', { NUMBER_0: 42 }),
        parser.sendUtterance('yes',  '','YesNo'),
        parser.sendUtterance('21 C', '', 'Measure(C)'),
        parser.sendUtterance('69 F', '', 'Measure(C)'),
    ]);
}

async function testMultipleChoice(text, expected) {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    const analyzed = await parser.sendUtterance(text, '', 'MultipleChoice',
        [{ title: 'choice number one' }, { title: 'choice number two' }]);

    assert.deepStrictEqual(analyzed.entities, {});
    assert.deepStrictEqual(analyzed.candidates[0].code, ['bookkeeping', 'choice', expected]);
}

async function testOnlineLearn() {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    await parser.onlineLearn('send sms', ['now', '=>', '@org.thingpedia.builtin.thingengine.phone.send_sms'], 'no');

    await parser.onlineLearn('abcdef', ['now', '=>', '@org.thingpedia.builtin.thingengine.phone.send_sms'], 'online');
    const analyzed = await parser.sendUtterance('abcdef');

    assert.deepStrictEqual(analyzed.candidates[0], {
        score: 'Infinity',
        code: ['now', '=>', '@org.thingpedia.builtin.thingengine.phone.send_sms']
    });
}

async function main() {
    await testContextual();
    await testEverything();
    await testExpect();
    await testMultipleChoice('choice number one', '0');
    await testMultipleChoice('choice number two', '1');
    await testOnlineLearn();

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();
