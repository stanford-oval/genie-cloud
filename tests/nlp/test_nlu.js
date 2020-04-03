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

const assert = require('assert');
const ThingTalk = require('thingtalk');
const Gettext = require('node-gettext');
const Tp = require('thingpedia');

const ParserClient = require('./parserclient');

const db = require('../../util/db');
const Config = require('../../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'external');

const gettext = new Gettext();
gettext.setLocale('en-US');

class DummyPreferences {
    keys() {
        return [];
    }

    get(key) {
        return undefined;
    }

    set(key, value) {}
}

const schemas = new ThingTalk.SchemaRetriever(new Tp.HttpClient({
    _prefs: new DummyPreferences(),
    getSharedPreferences() {
        return this._prefs;
    },
    getDeveloperKey() {
        return null;
    },
    locale: 'en-US',
}, Config.THINGPEDIA_URL), null, true);

async function testEverything() {
    const TEST_CASES = require('./parser_test_cases');
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    for (let i = 0; i < TEST_CASES.length; i++) {
        const test = TEST_CASES[i];
        const analyzed = await parser.sendUtterance(test);

        assert.strictEqual(typeof analyzed.intent, 'object');
        assert.strictEqual(typeof analyzed.intent.question, 'number');
        assert.strictEqual(typeof analyzed.intent.command, 'number');
        assert.strictEqual(typeof analyzed.intent.chatty, 'number');
        assert.strictEqual(typeof analyzed.intent.other, 'number');

        assert(Array.isArray(analyzed.candidates));

        // everything should typecheck because the server filters server side
        let candidates = await Promise.all(analyzed.candidates.map(async (candidate, beamposition) => {
            const program = ThingTalk.NNSyntax.fromNN(candidate.code, analyzed.entities);
            await program.typecheck(schemas, false);
            return program;
        }));
        assert(candidates.length > 0, `Failed parsing ${test}`);
        console.log(`${i+1}: ${test} => ${candidates[0].prettyprint()}`);
    }
}

async function testTokenize() {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    const tok1 = await parser.tokenize('1234');
    assert.deepStrictEqual(tok1, {
        result: 'ok',
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
        result: 'ok',
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
        result: 'ok',
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
        result: 'ok',
        tokens: ['foo'],
        pos_tags: ['NN'],
        raw_tokens: ['foo'],
        sentiment: 'neutral',
        entities: {
            NUMBER_0: 1234,
        }
    });
}

async function testContextual() {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    const q1 = await parser.sendUtterance('another one', {
        code: 'now => @com.thecatapi.get => notify',
        entities: {}
    });
    delete q1.intent;
    assert.deepStrictEqual(q1, {
        result: 'ok',
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
    delete q2.intent;
    assert.deepStrictEqual(q2, {
        result: 'ok',
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
    delete q3.intent;
    assert.deepStrictEqual(q3, {
        result: 'ok',
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

    const analyzed2 = await parser.sendUtterance(text, '', 'MultipleChoice',
        [{ title: 'CHOICE NUMBER ONE' }, { title: 'Choice Number Two' }]);

    assert.deepStrictEqual(analyzed2.entities, {});
    assert.deepStrictEqual(analyzed2.candidates[0].code, ['bookkeeping', 'choice', expected]);
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

const DEBUG = false;
function request(url, method, data, options = {}) {
    options['user-agent'] = 'Thingpedia-Cloud-Test/1.0.0';
    options.debug = DEBUG;

    if (url.indexOf('?') >= 0)
        url += `&admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`;
    else
        url += `?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`;
    return Tp.Helpers.Http.request(Config.NL_SERVER_URL + url, method, data, options);
}

function assertHttpError(request, httpStatus, expectedMessage) {
    return request.then(() => {
        assert.fail(new Error(`Expected HTTP error`));
    }, (err) => {
        if (!err.detail)
            throw err;
        if (typeof err.code === 'number')
            assert.deepStrictEqual(err.code, httpStatus);
        else
            throw err;
        if (expectedMessage) {
            let message;
            if (err.detail.startsWith('{'))
                message = JSON.parse(err.detail).error;
            else
                message = err.detail;
            assert.strictEqual(message, expectedMessage);
        }
    });
}

async function testAdmin() {
    // trying to access an invalid model or a model that was not trained will answer 404
    await assertHttpError(request('/@org.thingpedia.foo/en-US/query?q=hello', 'GET', '', {}), 404);
    await assertHttpError(request('/@org.thingpedia.test.nottrained/en-US/query?q=hello', 'GET', '', {}), 404);

    // reloading an invalid model will fail
    await assertHttpError(request('/admin/reload/@foo.bar/en-US', 'POST', '', {}), 404);

    // reloading any model will succeed, regardless of whether it was trained previously or not
    assert.deepStrictEqual(JSON.parse(await request('/admin/reload/@org.thingpedia.models.default/en-US',
        'POST', '', {})), { result: "ok" });

    assert.deepStrictEqual(JSON.parse(await request('/admin/reload/@org.thingpedia.test.nottrained/en-US',
        'POST', '', {})), { result: "ok" });

    // but after reload, if the model was not trained we still get 404
    await assertHttpError(request('/@org.thingpedia.test.nottrained/en-US/query?q=hello', 'GET', '', {}), 404);
}

async function main() {
    // TODO: train a full contextual model so we can enable this
    //await testContextual();

    await testEverything();
    await testTokenize();
    await testExpect();
    await testMultipleChoice('choice number one', '0');
    await testMultipleChoice('choice number two', '1');
    await testOnlineLearn();
    await testAdmin();

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();
