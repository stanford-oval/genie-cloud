// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';
import * as ThingTalk from 'thingtalk';
import Gettext from 'node-gettext';
import * as Tp from 'thingpedia';
import * as Genie from 'genie-toolkit';

import * as db from '../../src/util/db';
import * as Config from '../../src/config';
import * as localfs from '../../src/util/local_fs';
assert.strictEqual(Config.WITH_THINGPEDIA, 'external');

const gettext = new Gettext();
gettext.setLocale('en-US');
localfs.init();

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
    getTmpDir() {
        return localfs.getTmpDir();
    },
    getCacheDir() {
        return localfs.getCacheDir();
    },
    getWritableDir() {
        return localfs.getWritableDir();
    }
}, Config.THINGPEDIA_URL), null, true);

async function testEverything() {
    const TEST_CASES = await import('./parser_test_cases');
    const parser = Genie.ParserClient.get(Config.NL_SERVER_URL, 'en-US');

    for (let i = 0; i < TEST_CASES.length; i++) {
        const test = TEST_CASES[i];
        const analyzed = await parser.sendUtterance(test, undefined, undefined);

        assert.strictEqual(typeof analyzed.intent, 'object');
        assert.strictEqual(typeof analyzed.intent.command, 'number');
        assert.strictEqual(typeof analyzed.intent.other, 'number');
        assert.strictEqual(typeof analyzed.intent.ignore, 'number');

        assert(Array.isArray(analyzed.candidates));

        // everything should typecheck because the server filters server side
        let candidates = await Promise.all(analyzed.candidates.map(async (candidate, beamposition) => {
            const program = ThingTalk.Syntax.parse(candidate.code, ThingTalk.Syntax.SyntaxType.Tokenized, analyzed.entities);
            await program.typecheck(schemas, false);
            return program;
        }));
        assert(candidates.length > 0, `Failed parsing ${test}`);
        console.log(`${i+1}: ${test} => ${candidates[0].prettyprint()}`);
    }
}

async function tokenize(utterance) {
    const data = {
        q: utterance,
    };

    const response = await Tp.Helpers.Http.post(`${Config.NL_SERVER_URL}/en-US/tokenize`, JSON.stringify(data), {
        dataContentType: 'application/json' //'
    });

    const tokenized = JSON.parse(response);

    if (tokenized.error)
        throw new Error('Error received from NLP server: ' + tokenized.error);

    return tokenized;
}

async function testTokenize() {
    const tok1 = await tokenize('1234');
    assert.deepStrictEqual(tok1, {
        result: 'ok',
        tokens: ['1234'],
        raw_tokens: ['1234'],
        entities: {}
    });
}

async function testContextual() {
    const parser = Genie.ParserClient.get(Config.NL_SERVER_URL, 'en-US');

    const q1 = await parser.sendUtterance("i'm looking for a restaurant that serves chinese",
        'null'.split(' '), {}, {});
    delete q1.intent;
    assert.deepStrictEqual(q1, {
        result: 'ok',
        tokens: ['i', '\'m', 'looking', 'for', 'a', 'restaurant', 'that', 'serves', 'chinese'],
        entities: {},
        candidates: [{
            code: [
            '$dialogue', '@org.thingpedia.dialogue.transaction', '.', 'execute', ';',
            '@com.yelp', '.', 'restaurant', '(', ')', 'filter', 'contains', '(', 'cuisines', ',', 'null', '^^com.yelp:restaurant_cuisine', '(', '"', 'chinese', '"', ')', ')', ';' ],
            score: 1
        }]
    });

    const q2 = await parser.sendUtterance('how about something that serves italian food?',
        '$dialogue @org.thingpedia.dialogue.transaction . sys_empty_search ; @com.yelp . restaurant ( ) filter contains ( cuisines , GENERIC_ENTITY_com.yelp:restaurant_cuisine_0 ) #[ results = [ ] ] ;'.split(' '), {
            'GENERIC_ENTITY_com.yelp:restaurant_cuisine_0': { display: "Chinese", value: 'chinese' }
        });
    delete q2.intent;
    assert.deepStrictEqual(q2, {
        result: 'ok',
        tokens: 'how about something that serves italian food ?'.split(' '),
        entities: {
            'GENERIC_ENTITY_com.yelp:restaurant_cuisine_0': { display: "Chinese", value: 'chinese' }
        },
        candidates: [{
            code: [
            '$dialogue', '@org.thingpedia.dialogue.transaction', '.', 'execute', ';',
            '@com.yelp', '.', 'restaurant', '(', ')', 'filter', 'contains', '(', 'cuisines', ',', 'null', '^^com.yelp:restaurant_cuisine', '(', '"', 'italian', '"', ')', ')', ';' ],
            score: 1
        }]
    });
}

/*async function expectAnswer(parser, input, expecting, expectedCode, expectedEntities) {
    const analyzed = await parser.sendUtterance(input, undefined, undefined, { expect: expecting });

    assert(Array.isArray(analyzed.candidates));
    assert(analyzed.candidates.length > 0);

    assert.strictEqual(analyzed.candidates[0].code.join(' '), expectedCode);
    assert.deepStrictEqual(analyzed.entities, expectedEntities);
}*/

function testExpect() {
    const parser = Genie.ParserClient.get(Config.NL_SERVER_URL, 'en-US');

    return Promise.all([
        //expectAnswer(parser, '42', 'Number', '$answer ( 42 ) ;', {}),
        parser.sendUtterance('yes', undefined, undefined, { expect: 'YesNo' }),
        parser.sendUtterance('21 C', undefined, undefined, { expect: 'Measure(C)' }),
        parser.sendUtterance('69 F', undefined, undefined, { expect: 'Measure(C)' }),
    ]);
}

async function testMultipleChoice(text, expected) {
    const parser = Genie.ParserClient.get(Config.NL_SERVER_URL, 'en-US');

    const analyzed = await parser.sendUtterance(text, undefined, undefined, {
        expect: 'MultipleChoice',
        choices: ['choice number one', 'choice number two']
    });

    assert.deepStrictEqual(analyzed.entities, {});
    assert.deepStrictEqual(analyzed.candidates[0].code, ['$choice', '(', expected, ')', ';']);

    const analyzed2 = await parser.sendUtterance(text, undefined, undefined, {
        expect: 'MultipleChoice',
        choices: ['CHOICE NUMBER ONE', 'Choice Number Two']
    });

    assert.deepStrictEqual(analyzed2.entities, {});
    assert.deepStrictEqual(analyzed2.candidates[0].code, ['$choice', '(', expected, ')', ';']);
}

async function testOnlineLearn() {
    const parser = Genie.ParserClient.get(Config.NL_SERVER_URL, 'en-US');

    console.log(await parser.onlineLearn('send sms', ['@org.thingpedia.builtin.thingengine.phone', '.',  'send_sms', '(', ')', ';'], 'no'));

    console.log(await parser.onlineLearn('abcdef', ['@org.thingpedia.builtin.thingengine.phone', '.',  'send_sms', '(', ')', ';'], 'online'));
    const analyzed = await parser.sendUtterance('abcdef');

    assert.deepStrictEqual(analyzed.candidates[0], {
        score: 'Infinity',
        code: ['@org.thingpedia.builtin.thingengine.phone', '.',  'send_sms', '(', ')', ';']
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
    // trying to access an invalid model will answer 404
    await assertHttpError(request('/@org.thingpedia.foo/en-US/query?q=hello', 'GET', '', {}), 404);

    // reloading an invalid model will fail
    await assertHttpError(request('/admin/reload/@foo.bar/en-US', 'POST', '', {}), 404);

    // reloading any model will succeed
    assert.deepStrictEqual(JSON.parse(await request('/admin/reload/@org.thingpedia.models.default/en-US',
        'POST', '', {})), { result: "ok" });
}

async function main() {
    await testContextual();
    await testEverything();
    await testTokenize();
    await testExpect();
    await testMultipleChoice('choice number one', '0');
    await testMultipleChoice('choice number two', '1');
    await testOnlineLearn();
    await testAdmin();

    await db.tearDown();
}
export default main;
if (!module.parent)
    main();
