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
