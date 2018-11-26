// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const PARAM_REGEX = /\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/;

function* split(pattern, regexp) {
    // a split that preserves capturing parenthesis

    let clone = new RegExp(regexp, 'g');
    let match = clone.exec(pattern);

    let i = 0;
    while (match !== null) {
        if (match.index > i)
            yield pattern.substring(i, match.index);
        yield match;
        i = clone.lastIndex;
        match = clone.exec(pattern);
    }
    if (i < pattern.length)
        yield pattern.substring(i, pattern.length);
}

module.exports = {
    PARAM_REGEX,

    splitParams(utterance) {
        return Array.from(split(utterance, PARAM_REGEX));
    },
    split,

    clean(name) {
        if (/^[vwgpd]_/.test(name))
            name = name.substr(2);
        return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
    },

    tokenize(string) {
        var tokens = string.split(/(\s+|[,."'!?])/g);
        return tokens.filter((t) => !(/^\s*$/).test(t)).map((t) => t.toLowerCase());
    },

    rejoin(tokens) {
        // FIXME: do something sensible wrt , and .
        return tokens.join(' ');
    }
};
