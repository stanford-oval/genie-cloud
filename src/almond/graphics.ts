// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
import * as stream from 'stream';
import * as util from 'util';
import * as Tp from 'thingpedia';

class Image implements Tp.Capabilities.Image {
    private _gm : gm.State;

    constructor(how : string|Buffer) {
        this._gm = gm(how);
    }

    getSize() {
        return util.promisify<gm.Dimensions>(this._gm.size).call(this._gm);
    }

    resizeFit(width : number, height : number) {
        this._gm = this._gm.resize(width, height);
    }

    stream(format : string) {
        return util.promisify<string, stream.Readable>(this._gm.stream).call(this._gm, format);
    }

    toBuffer() {
        return util.promisify<Buffer>(this._gm.toBuffer).call(this._gm);
    }
}

export function createImageFromPath(path : string) {
    return new Image(path);
}

export function createImageFromBuffer(buffer : Buffer) {
    return new Image(buffer);
}
