// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const semver = require('semver');

function streamJoinArrow(code) {
    // convert stream-join "=>" to "join"

    if (code.length === 0 || code[0] === 'policy')
        return;

    let start = 0;
    if (code[0] === 'executor') {
        while (code[start] !== ':')
            start += 1;
        start += 1;
    }

    const has_now = code[start] === 'now';
    if (has_now)
        start += 2; // "now" & "=>"

    let last_arrow = null;
    for (let i = code.length-1; i > start; i--) {
        if (code[i] === '=>') {
            last_arrow = i;
            break;
        }
    }

    // no arrow past "now =>" means a straight do, so no fixup needed
    if (last_arrow === null)
        return;

    for (let i = start; i < last_arrow; i++) {
        if (code[i] === '=>')
            code[i] = 'join';
    }
}

const COMPATIBILITY_FIXES = [
    ['<1.3.0', streamJoinArrow]
];

module.exports = function applyCompatibility(results, thingtalk_version) {
    for (let [range, fix] of COMPATIBILITY_FIXES) {
        if (semver.satisfies(thingtalk_version, range)) {
            for (let result of results)
                fix(result.code);
        }
    }
};
