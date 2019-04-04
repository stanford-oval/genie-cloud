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
    matcher.add('get a cat', 'now => @com.thecatapi2.get => notify');
    matcher.add('get a cat', 'now => @com.thecatapi3.get => notify');
    matcher.add('get a dog', 'now => @uk.co.thedogapi.get => notify');

    // later calls to add() should "win" - be sorted first in the result
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
