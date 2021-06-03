// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
import * as crypto from 'crypto';

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

function makeRandom(size = 32) {
    return crypto.randomBytes(size).toString('hex');
}

export {
    coin,
    uniform,
    choose,
    categorical,

    makeRandom
};
