// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

const assert = require('assert');

const ExactMatcher = require('../../nlp/exact');

function testBasic() {
    const matcher = new ExactMatcher('en', 'default');

    matcher.add('get xkcd', 'now => @com.xkcd.get => notify');
    matcher.add('post on twitter', 'now => @com.twitter.post');
    matcher.add('post on twitter saying foo', 'now => @com.twitter.post param:status:String = " foo "');

    assert.deepStrictEqual(matcher.get('post on twitter'), ['now => @com.twitter.post'.split(' ')]);
    assert.deepStrictEqual(matcher.get('post on twitter saying foo'), ['now => @com.twitter.post param:status:String = " foo "'.split(' ')]);

    assert.strictEqual(matcher.get('post on facebook'), null);
    assert.strictEqual(matcher.get('post on twitter with lol'), null);
    assert.strictEqual(matcher.get('post on'), null);
}

function testQuoteFree() {
    const matcher = new ExactMatcher('en', 'default');

    matcher.add('get xkcd', 'now => @com.xkcd.get => notify');
    matcher.add('post on twitter', 'now => @com.twitter.post');
    matcher.add('post on twitter saying foo', 'now => @com.twitter.post param:status:String = " foo "');
    matcher.add('post abc on twitter', 'now => @com.twitter.post param:status:String = " abc "');
    matcher.add('post abc def on twitter', 'now => @com.twitter.post param:status:String = " abc def "');
    matcher.add('post abc on facebook', 'now => @com.facebook.post param:status:String = " abc "');
    matcher.add('post websites on twitter', 'now => @com.bing.search => @com.twitter.post');

    assert.deepStrictEqual(matcher.get('post on twitter'), [('now => @com.twitter.post'.split(' '))]);
    assert.deepStrictEqual(matcher.get('post on twitter saying foo'), [('now => @com.twitter.post param:status:String = " foo "'.split(' '))]);
    assert.deepStrictEqual(matcher.get('post on twitter saying lol'), [('now => @com.twitter.post param:status:String = " lol "'.split(' '))]);

    assert.deepStrictEqual(matcher.get('post abc on twitter'), [('now => @com.twitter.post param:status:String = " abc "'.split(' '))]);
    assert.deepStrictEqual(matcher.get('post def on twitter'), [('now => @com.twitter.post param:status:String = " def "'.split(' '))]);
    assert.deepStrictEqual(matcher.get('post def ghi on twitter'), [('now => @com.twitter.post param:status:String = " def ghi "'.split(' '))]);
    assert.deepStrictEqual(matcher.get('post abc on facebook'), [('now => @com.facebook.post param:status:String = " abc "'.split(' '))]);

    assert.deepStrictEqual(matcher.get('post websites on twitter'), [('now => @com.bing.search => @com.twitter.post'.split(' '))]);

    assert.strictEqual(matcher.get('post on facebook'), null);
    assert.strictEqual(matcher.get('post on twitter with lol'), null);
    assert.strictEqual(matcher.get('post abc on linkedin'), null);
    assert.strictEqual(matcher.get('post abc def ghi on twitter'), null);
    assert.strictEqual(matcher.get('post on'), null);
}

function testAmbiguous() {
    const matcher = new ExactMatcher('en', 'default');

    matcher.add('get a cat', 'now => @com.thecatapi.get => notify');
    matcher.add('get a cat', 'now => @com.thecatapi3.get => notify');
    matcher.add('get a cat', 'now => @com.thecatapi2.get => notify');
    matcher.add('get a cat', 'now => @com.thecatapi3.get => notify');
    matcher.add('get a dog', 'now => @uk.co.thedogapi.get => notify');

    // later calls to add() should "win" - be sorted first in the result
    // and there should be no duplicates
    assert.deepStrictEqual(matcher.get('get a cat'), [
        'now => @com.thecatapi3.get => notify'.split(' '),
        'now => @com.thecatapi2.get => notify'.split(' '),
        'now => @com.thecatapi.get => notify'.split(' '),
    ]);

    assert.deepStrictEqual(matcher.get('get a dog'), ['now => @uk.co.thedogapi.get => notify'.split(' ')]);
}

async function main() {
    testBasic();
    testQuoteFree();
    testAmbiguous();
}
module.exports = main;
if (!module.parent)
    main();
