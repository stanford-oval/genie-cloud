/* -*- mode: js; indent-tabs-mode: nil; -*- */
//
// Copyright (c) 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
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

const Q = require('q');

const util = require('util');
const events = require('events');

// Exactly what the name suggests, this class is wraps a TCP/Unix stream
// socket to send and receive (mostly receive) JSON payloads
function JsonDatagramSocket(socket, encoding) {
    if (!(this instanceof JsonDatagramSocket)) return new JsonDatagramSocket(socket, encoding);
    events.EventEmitter.call(this);

    this._socket = socket;
    this._encoding = encoding;

    this._partialMessage = '';

    // NOTE: this is for reading ONLY
    // Always specify the encoding when writing
    socket.setEncoding(encoding);
    socket.on('data', function(data) {
        if (socket != this._socket) // robustness
            return;

        this._partialMessage += data;
        this._tryReadMessage();
    }.bind(this));

    socket.on('end', function() {
        this.emit('end');
    }.bind(this));
    socket.on('close', function(hadError) {
        this.emit('close', hadError);
    }.bind(this));
}
util.inherits(JsonDatagramSocket, events.EventEmitter);

JsonDatagramSocket.prototype.end = function(callback) {
    this._socket.end(callback);
    this._socket = null;
}

JsonDatagramSocket.prototype.destroy = function() {
    this._socket.destroy();
    this._socket = null;
}

JsonDatagramSocket.prototype._tryReadMessage = function() {
    var msg;

    try {
        msg = JSON.parse(this._partialMessage);
    } catch(e) {
        // Failed: does not parse as JSON
        //console.log('Partial read on control channel: ' + this._partialMessage);
        return;
    }

    this._partialMessage = '';
    this.emit('data', msg);
}

JsonDatagramSocket.prototype.write = function(msg, callback) {
    this._socket.write(JSON.stringify(msg), this._encoding, callback);
}

module.exports = JsonDatagramSocket;
