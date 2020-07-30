// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
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

// Graphics API abstraction, based on nodejs-gm

const Q = require('q');
const gm = require('gm');

class Image {
    constructor(how) {
        this._gm = gm(how);
    }

    getSize() {
        return Q.ninvoke(this._gm, 'size');
    }

    resizeFit(width, height) {
        this._gm = this._gm.resize(width, height);
    }

    stream(format) {
        return Q.ninvoke(this._gm, 'stream', format);
    }

    toBuffer() {
        return Q.ninvoke(this._gm, 'toBuffer');
    }
}

module.exports = {
    createImageFromPath(path) {
        return new Image(path);
    },

    createImageFromBuffer(buffer) {
        return new Image(buffer);
    },
};

