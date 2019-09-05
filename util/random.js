// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const crypto = require('crypto');

function choose(from, n, rng = Math.random) {
    if (n === 0)
        return [];
    if (n >= from.length)
        return from;

    let taken = [];
    function next() {
        let idx = Math.floor(rng()*(from.length - taken.length));
        for (let i = 0; i < from.length; i++) {
            if (taken[i])
                continue;
            if (idx === 0) {
                taken[i] = true;
                return from[i];
            }
            idx--;
        }

        throw new assert.AssertionError(`code should not be reached`);
    }

    let res = [];
    while (n > 0) {
        res.push(next());
        n--;
    }
    return res;
}

function coin(prob, rng = Math.random) {
    return rng() <= prob;
}
function uniform(array, rng = Math.random) {
    return array[Math.floor(rng() * array.length)];
}
function categorical(weights, rng = Math.random) {
    const cumsum = new Array(weights.length);
    cumsum[0] = weights[0];
    for (let i = 1; i < weights.length; i++)
        cumsum[i] = cumsum[i-1] + weights[i];

    const value = rng() * cumsum[cumsum.length-1];

    for (let i = 0; i < weights.length; i++) {
        if (value <= cumsum[i])
            return i;
    }
    return cumsum.length-1;
}

// inplace array shuffle
function swap(array, i, j) {
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
}
function shuffle(array, rng = Math.random) {
    for (let i = 0; i < array.length-1; i++) {
        const idx = Math.floor(rng() * (array.length - i));
        swap(array, i, i+idx);
    }
}

function makeRandom(size = 32) {
    return crypto.randomBytes(size).toString('hex');
}

module.exports = {
    coin,
    uniform,
    choose,
    categorical,
    shuffle,

    makeRandom
};
