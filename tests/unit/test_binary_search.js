// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const binarySearch = require('../../util/binary_search');

function main() {
    assert.strictEqual(binarySearch([0.1, 0.2, 0.5, 1.0], 0.0), 0);
    assert.strictEqual(binarySearch([0.1, 0.2, 0.5, 1.0], 0.05), 0);
    assert.strictEqual(binarySearch([0.1, 0.2, 0.5, 1.0], 0.15), 1);
    assert.strictEqual(binarySearch([0.1, 0.2, 0.5, 1.0], 0.3), 2);
    assert.strictEqual(binarySearch([0.1, 0.2, 0.5, 1.0], 0.6), 3);
    assert.strictEqual(binarySearch([0.1, 0.2, 0.5, 1.0], 1.0), 3);
    assert.strictEqual(binarySearch([0.1, 0.2, 0.5, 1.0], 0.2), 1);

    assert.strictEqual(binarySearch([0, 4096], 4095), 1);
}
module.exports = main;
if (!module.parent)
    main();
