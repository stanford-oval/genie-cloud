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

require('thingengine-core/lib/polyfill');
const qs = require('qs');
const assert = require('assert');

const iv = require('../../util/input_validation');

const TEST_CASES = [
    ['foo=bar', { foo: 'string' }, true],
    ['foo=bar', { foo: 'number' }, false],
    ['foo=bar', { foo: '?string' }, true],
    ['', { foo: '?string' }, true],
    ['', { foo: 'string' }, false],
    ['', { foo: '?number' }, true],

    ['foo=1&bar=2', { foo: 'string', bar: 'number' }, true],
    ['foo=1&bar=lol', { foo: 'string', bar: 'number' }, false],
    ['foo=&bar=2', { foo: 'string', bar: 'number' }, false],

    ['foo=', { foo: '?string' }, true],
    ['foo=', { foo: 'string' }, false],
    ['foo=', { foo: '?number' }, true],
    ['foo=', { foo: 'number' }, false],
    ['foo=', { foo: '?integer' }, true],
    ['foo=', { foo: 'integer' }, false],
    ['foo=', { foo: 'boolean' }, true],
    ['foo=', { foo: '?boolean' }, true],
    ['', { foo: 'boolean' }, true],

    ['foo=1', { foo: 'boolean' }, true],
    ['foo=0', { foo: 'boolean' }, false],
    ['foo=false', { foo: 'boolean' }, false],
    ['foo=true', { foo: 'boolean' }, false],

    ['foo=1', { foo: 'number' }, true],
    ['foo=1.5', { foo: 'number' }, true],
    ['foo=.5e-3', { foo: 'number' }, true],
    ['foo=Infinity', { foo: 'number' }, false],
    ['foo=1', { foo: 'integer' }, true],
    ['foo=1.5', { foo: 'integer' }, false],

    ['foo[]=', { foo: 'array' }, true],
    ['', { foo: 'array' }, false],
    ['foo=1&foo=2', { foo: 'array' }, true],
    ['foo=1', { foo: 'array' }, false],
    ['foo=1', { foo: ['array', 'string']}, true],
    ['foo=1&foo=2', { foo: ['array', 'string']}, true],
    ['', { foo: ['array', 'string']}, false],
    ['', { foo: ['array', '?string']}, true],
    ['', { foo: '?array' }, true],

    ['foo[key]=1', { foo: 'object' }, true],
    ['foo[key]=1', { foo: 'array' }, false],
    ['foo[key]=1', { foo: 'string' }, false],
    ['foo[]=1&foo[key]=2', { foo: 'array' }, false],

    ['', { foo: 'string' }, false, { json: true }],
];

function test(i) {
    console.log(`Test Case #${i+1}`);
    const [input, validation, expected, options] = TEST_CASES[i];

    const req = {
        _(x) { return x; },
        query: qs.parse(input)
    };
    const res = {
        status(x) {
            if (expected)
                assert.fail(`unexpected response for ${input}`);
            else
                assert.strictEqual(x, 400);
        },

        json(v) {
            if (expected)
                assert.fail(`unexpected response for ${input}`);
            assert(options.json);
            assert.strictEqual(typeof v.error, 'string');
            assert.strictEqual(v.code, 'EINVAL');
        },
        render(page) {
            assert(!options || !options.json);
            if (expected)
                assert.fail(`unexpected response for ${input}`);
            assert.strictEqual(page, 'error');
        }
    };
    const next = (err) => {
        assert(!err);
        if (!expected)
            assert.fail(`unexpected next() for ${input}`);
    };

    iv.validateGET(validation, options)(req, res, next);
}

function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        test(i);
}
module.exports = main;
if (!module.parent)
    main();
