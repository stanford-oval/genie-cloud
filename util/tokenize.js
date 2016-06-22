// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

module.exports = {
    tokenize(string) {
        var tokens = string.split(/(\s+|[,\.\"\'])/g);
        return tokens.filter((t) => !(/^\s*$/).test(t)).map((t) => t.toLowerCase());
    },

    rejoin(tokens) {
        // FIXME: do something sensible wrt , and .
        return tokens.join(' ');
    }
};
