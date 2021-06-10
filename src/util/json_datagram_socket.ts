// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2015-2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as stream from 'stream';
import * as events from 'events';

// Exactly what the name suggests, this class is wraps a TCP/Unix stream
// socket to send and receive JSON payloads
export default class JsonDatagramSocket<ReadType, SendType> extends events.EventEmitter {
    private _reader : stream.Readable|null;
    private _writer : stream.Writable|null;
    private _encoding : BufferEncoding;
    private _partialMessage : string;

    constructor(reader : stream.Readable, writer : stream.Writable, encoding : BufferEncoding) {
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
        reader.on('close', (hadError : boolean) => {
            this.emit('close', hadError);
        });
    }

    on(event : 'data', cb : (data : ReadType) => void) : this;
    on(event : 'error', cb : (err : Error) => void) : this;
    on(event : 'end', cb : () => void) : this;
    on(event : 'close', cb : (hadError ?: boolean) => void) : this;
    on(event : string, cb : any) {
        return super.on(event, cb);
    }

    end(callback ?: (err ?: Error) => void) {
        if (this._writer)
            this._writer.end(callback);
        this._writer = null;
    }

    destroy() {
        if (this._reader)
            this._reader.destroy();
        if (this._writer)
            this._writer.destroy();
        this._reader = null;
        this._writer = null;
    }

    _tryReadMessage() {
        let msg;

        const split = this._partialMessage.split('\n');
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

    write(msg : SendType, callback ?: (err ?: Error|null) => void) : void {
        if (!this._writer)
            return;
        this._writer.write(JSON.stringify(msg), this._encoding);
        this._writer.write('\n', this._encoding, callback);
    }
}
