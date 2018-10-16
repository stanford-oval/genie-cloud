// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;

function coin(rng, prob) {
    return rng() <= prob;
}
function uniform(rng, array) {
    return array[Math.floor(rng() * array.length)];
}

const TIMER_SCHEMA = new Ast.FunctionDef('stream',
    'timer',
    [], // args,
    false, // is_list
    true,  // is_monitorable
    {
    canonical: 'every fixed interval',
    confirmation: 'every ${interval}',
    },
    {} // annotations
);

const AT_TIMER_SCHEMA = new Ast.FunctionDef('stream',
    'attimer',
    [], // args,
    false, // is_list
    true,  // is_monitorable
    {
    canonical: 'every day',
    confirmation: 'every day at ${interval}',
    },
    {} // annotations
);

function replaceMeMy(derivation) {
    let clone = derivation.clone();
    for (let i = 0; i < clone.sentence.length; i++) {
        if (typeof clone.sentence[i] !== 'string')
            continue;
        clone.sentence[i] = clone.sentence[i].replace(/\b(me|my|i|mine)\b/, (what) => {
            switch(what) {
            case 'me':
                return 'them';
            case 'my':
                return 'their';
            case 'mine':
                return 'theirs';
            case 'i':
                return 'they';
            default:
                return what;
            }
        });
    }
    return clone;
}

function identity(x) {
    return x;
}
function flip(f) {
    return function(x, y) {
        return f(y, x);
    };
}


module.exports = {
    identity,
    flip,

    coin,
    uniform,

    TIMER_SCHEMA,
    AT_TIMER_SCHEMA,

    replaceMeMy
};
