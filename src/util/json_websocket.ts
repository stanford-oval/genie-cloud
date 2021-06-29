// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2021 The Board of Trustees of the Leland Stanford Junior University
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

import stream from 'stream';
import * as events from 'events';

// Adapter to read and write JSON objects via a WebSocket stream, usually from
// ws.createWebSocketStream.
export default class JsonWebSocketAdapter extends events.EventEmitter {
    private socket : stream.Duplex|null;

    constructor(socket : stream.Duplex) {
        super();
        this.socket = socket;
        socket.setEncoding('utf-8');
        socket.on('data', (chunk : any) => {
            this.emit('data', JSON.parse(chunk));
        });

        socket.on('error', (err) => {
            this.emit('error', err);
        });
        socket.on('end', () => {
            this.emit('end');
        });
        socket.on('close', (hadError : boolean) => {
            this.emit('close', hadError);
        });
    }

    on(event : 'data', cb : (data : any) => void) : this;
    on(event : 'error', cb : (err : Error) => void) : this;
    on(event : 'end', cb : () => void) : this;
    on(event : 'close', cb : (hadError ?: boolean) => void) : this;
    on(event : string, cb : any) {
        return super.on(event, cb);
    }

    end(callback ?: (err ?: Error) => void) {
        if (this.socket)
            this.socket.end(callback);
        this.socket = null;
    }

    destroy() {
        if (this.socket)
            this.socket.destroy();
        this.socket = null;
    }

    write(data : any, callback ?: (err ?: Error|null) => void) : void {
        if (!this.socket)
            return;
        this.socket.write(JSON.stringify(data), "utf-8", callback);
    }
}