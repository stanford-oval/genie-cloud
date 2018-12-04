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

const { coin, uniform, choose } = require('./random');

function applyPPDB(ex, ppdb, { rng = Math.random, debug = false, probability = 0.1 }) {
    let inSpan = false;
    let spanWords = new Set;
    for (let tok of ex.target_code.split(' ')) {
        if (tok === '"')
            inSpan = !inSpan;
        else if (inSpan)
            spanWords.add(tok);
    }

    const sentence = ex.preprocessed.split(' ');
    const replaceable = new Map;
    for (let word of sentence) {
        if (spanWords.has(word))
            continue;

        let replacements = ppdb.get(word);
        if (replacements.length > 0)
            replaceable.set(word, replacements);
    }

    if (replaceable.size === 0) {
        if (debug)
            console.log(`ppdb: skipped ${ex.id} (no replaceable words found)`);
        return null;
    }
    let toreplace;
    if (replaceable.size === 1)
        toreplace = Array.from(replaceable.keys());
    else
        toreplace = choose(Array.from(replaceable.keys()), 2, rng);

    if (!coin(probability, rng))
        return null;

    const newUtterance = sentence.map((word) => {
        if (toreplace.indexOf(word) >= 0)
            return uniform(replaceable.get(word), rng);
        else
            return word;
    }).join(' ');

    let flags = ex.flags.replace(/,exact/, '');
    return {
        id: ex.id,
        flags: flags ? flags + ',augmented' : 'augmented',
        type: ex.type,
        utterance: newUtterance,
        preprocessed: newUtterance,
        target_code: ex.target_code
    };
}

module.exports = {
    apply: applyPPDB
};
