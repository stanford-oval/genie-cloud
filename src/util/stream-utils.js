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


const assert = require('assert');
const Stream = require('stream');

class ChainStream extends Stream.Readable {
    constructor(chain, options = {}) {
        super(options);

        this._chain = chain;
        this._separator = options.separator;
        this._i = 0;
    }

    _read(n) {
        if (this._i >= this._chain.length) {
            this.push(null);
            return;
        }

        let next = this._chain[this._i];
        let chunk = next.read(n);
        if (chunk !== null) {
            this.push(chunk);
            return;
        }

        // ReadableStream.read returns null in three cases:
        //
        // - the stream is open and there is not enough data to read (ended === false)
        // - the stream is ended, there is data left but not enough to read
        // - the stream is ended and there is nothing left ('end' has been emitted)
        //
        // in the first case, we want to connect to readable and read more later
        // when data shows up
        //
        // in the second case, we want to consume as much data as possible,
        // then try to read the rest from the next stream
        //
        // in the third case, we want to switch to the next stream right away
        // and try to read more

        if (!next._readableState.ended) {
            // first case
            next.once('readable', () => this._read(n));
        } else if (next._readableState.length > 0) {
            // second case

            chunk = next.read(next._readableState.length);
            assert(chunk !== null);
            this.push(chunk);

            // stream has ended and we consumed all data, switch to the next one
            this._i ++;
            if (this._i < this._chain.length && this._separator)
                this.push(this._separator);
            process.nextTick(() => this._read(n - chunk.length));
        } else {
            // third case

            // stream has ended and we consumed all data, switch to the next one
            this._i ++;
            if (this._i < this._chain.length && this._separator)
                this.push(this._separator);
            process.nextTick(() => this._read(n));
        }
    }
}

function chain(streams, options) {
    return new ChainStream(streams, options);
}

module.exports = {
    chain,

    waitFinish(stream) {
        return new Promise((resolve, reject) => {
            stream.once('finish', resolve);
            stream.on('error', reject);
        });
    }
};
