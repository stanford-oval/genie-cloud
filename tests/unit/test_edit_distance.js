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

const editDistance = require('../../util/edit_distance');

function main() {
    assert.strictEqual(editDistance('abc', 'abc'), 0);

    assert.strictEqual(editDistance('abc', 'def'), 3);

    assert.strictEqual(editDistance('abc', 'abce'), 1);
    assert.strictEqual(editDistance('abc', 'acbc'), 1);
    assert.strictEqual(editDistance('abc', 'cabc'), 1);
    assert.strictEqual(editDistance('abce', 'abc'), 1);
    assert.strictEqual(editDistance('abcb', 'abc'), 1);
    assert.strictEqual(editDistance('cabc', 'abc'), 1);

    assert.strictEqual(editDistance('abc', 'ac'), 1);
    assert.strictEqual(editDistance('abc', 'ab'), 1);
    assert.strictEqual(editDistance('abc', 'bc'), 1);

    assert.strictEqual(editDistance('abc', 'acb'), 2);
    assert.strictEqual(editDistance('abc', 'cab'), 2);
    assert.strictEqual(editDistance('abc', 'dab'), 2);

    assert.strictEqual(editDistance('abc', ''), 3);
    assert.strictEqual(editDistance('', 'abc'), 3);

    assert.strictEqual(editDistance('', ''), 0);
}
module.exports = main;
if (!module.parent)
    main();
