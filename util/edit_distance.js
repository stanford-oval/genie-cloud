// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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
