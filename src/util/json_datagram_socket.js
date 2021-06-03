// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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
/* -*- mode: js; indent-tabs-mode: nil; -*- */
//
// Copyright (c) 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

import * as events from 'events';

// Exactly what the name suggests, this class is wraps a TCP/Unix stream
// socket to send and receive JSON payloads
export default class JsonDatagramSocket extends events.EventEmitter {
    constructor(reader, writer, encoding) {
        super();

        this._reader = reader;
        this._writer = writer;
        this._encoding = encoding;

        this._partialMessage = '';

        // NOTE: this is for reading ONLY
        // Always specify the encoding when writing
        reader.setEncoding(encoding);
        reader.on('data', (data) => {
            if (reader !== this._reader) // robustness
                return;

            this._partialMessage += data;
            this._tryReadMessage();
        });

        reader.on('error', (err) => this.emit('error', err));
        reader.on('end', () => {
            this.emit('end');
        });
        reader.on('close', (hadError) => {
            this.emit('close', hadError);
        });
    }

    end(callback) {
        this._writer.end(callback);
        this._writer = null;
    }

    destroy() {
        this._reader.destroy();
        this._writer.destroy();
        this._reader = null;
        this._writer = null;
    }

    _tryReadMessage() {
        let msg;

        let split = this._partialMessage.split('\n');
        this._partialMessage = split[split.length-1];

        for (let i = 0; i < split.length-1; i++) {
            if (!split[i])
                continue;
            try {
                msg = JSON.parse(split[i]);
            } catch(e) {
                console.log('Message does not parse as JSON: '+ split[i]);
                continue;
            }

            this.emit('data', msg);
        }

        if (this._partialMessage === '')
            return;

        try {
            msg = JSON.parse(this._partialMessage);
        } catch(e) {
            // Failed: does not parse as JSON
            //console.log('Partial read on JSON channel: ' + this._partialMessage);
            return;
        }

        this.emit('data', msg);
        this._partialMessage = '';
    }

    write(msg, callback) {
        this._writer.write(JSON.stringify(msg), this._encoding);
        this._writer.write('\n', this._encoding, callback);
    }
}
