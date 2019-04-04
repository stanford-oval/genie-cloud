// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

class Matrix {
    constructor(R, C) {
        this.R = R;
        this.C = C;

        this.buffer = new Array(R * C);
    }

    _idx(i, j) {
        return i * this.C + j;
    }

    get(i, j) {
        return this.buffer[this._idx(i, j)];
    }

    set(i, j, v) {
        this.buffer[this._idx(i, j)] = v;
    }
}

module.exports = function editDistance(one, two) {
    const matrix = new Matrix(one.length+1, two.length+1);

    for (let j = 0; j <= two.length; j++)
        matrix.set(0, j, j);
    for (let i = 1; i <= one.length; i++)
        matrix.set(i, 0, i);

    for (let i = 1; i <= one.length; i++) {
        for (let j = 1; j <= two.length; j++) {
            if (one[i-1] === two[j-1]) {
                matrix.set(i, j, matrix.get(i-1, j-1));
            } else {
                matrix.set(i, j, 1 + Math.min(
                    matrix.get(i-1, j),
                    matrix.get(i, j-1),
                    matrix.get(i-1, j-1)
                ));
            }
        }
    }

    return matrix.get(one.length, two.length);
};
