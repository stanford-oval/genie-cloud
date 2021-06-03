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


// Graphics API abstraction, based on nodejs-gm

import gm from 'gm';

function ninvoke(obj, method, ...args) {
    return new Promise((resolve, reject) => {
        obj[method](...args, (err, res) => {
            if (err)
                reject(err);
            else
                resolve(res);
        });
    });
}

class Image {
    constructor(how) {
        this._gm = gm(how);
    }

    getSize() {
        return ninvoke(this._gm, 'size');
    }

    resizeFit(width, height) {
        this._gm = this._gm.resize(width, height);
    }

    stream(format) {
        return ninvoke(this._gm, 'stream', format);
    }

    toBuffer() {
        return ninvoke(this._gm, 'toBuffer');
    }
}

export function createImageFromPath(path) {
    return new Image(path);
}

export function createImageFromBuffer(buffer) {
    return new Image(buffer);
}
