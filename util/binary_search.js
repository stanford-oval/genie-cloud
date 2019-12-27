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

module.exports = function binarySearch(cumsum, value) {
    if (cumsum.length === 0)
        return undefined;
    let a = 0, b = cumsum.length;
    for (;;) {
        if (b - a === 1)
            return a;
        if (b - a === 2) {
            if (value <= cumsum[a])
                return a;
            else
                return a+1;
        }
        let m = Math.floor((a+b)/2);
        if (value <= cumsum[m])
            b = m+1;
        else
            a = m;
    }
};

