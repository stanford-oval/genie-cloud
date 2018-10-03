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

module.exports = {
    clean(name) {
        if (/^[vwg]_/.test(name))
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
