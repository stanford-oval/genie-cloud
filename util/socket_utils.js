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
//
"use strict";

const crypto = require('crypto');
const net = require('net');
const os = require('os');
const path = require('path');
const stream = require('stream');


// Adapter to read and write JSON objects via frame based socket usually created from WebSocket.
class JsonSocketAdapter extends stream.Duplex {
    constructor(socket) {
        super({ objectMode: true });
        socket.setEncoding('utf-8');
        this._socket = socket;
        socket.on('data', (chunk) => {
            this.emit('data', JSON.parse(chunk));
        });
    }

    _read() {}

    _write(data, encoding, callback) {
        this._socket.write(JSON.stringify(data), encoding, callback);
    }
}


// A server to create proxy sockets using the following connections
//     socket --- proxySocket --- remoteSocket
// proxySocket and remoteSocket connection is created using unix domain socket.
// Since proxySocket and remoteSocket are stream based, transparent-rpc will not work 
// with JsonSocketAdapter and JsonDatagramSocket is recommended.
class SocketProxyServer {
    constructor() {
        this._nextNum = 0;
	this._socketsMap = {};
        this._proxyPath = path.join(os.tmpdir(), `ws.${ (crypto.randomBytes(16)).toString('hex')}.sock`);
        this._proxyServer = null;
    }

    start() {
        const socketsMap = this._socketsMap;
        this._proxyServer = net.createServer((socket) => {
            const uid = (this._nextNum++).toString();
            socketsMap[uid] = socket;
            socket.write(uid, 'utf-8');
        });

        this._proxyServer.on('error', (err) => {
          throw err;
        });
        this._proxyServer.listen(this._proxyPath, () => {
        });
    }

    newProxySocket(socket) {
        const proxySocket = net.createConnection(this._proxyPath);
        const socketsMap = this._socketsMap;
        return new Promise((resolve, reject) => {
            const init = (uid) => {
                uid = uid.toString();
                proxySocket.removeListener('data', init);
                const remoteSocket = socketsMap[uid];
                if (!remoteSocket) {
                    reject(new Error(`${uid} remote socket not found.`));
                    return;
                }
                socket.pipe(proxySocket);
                proxySocket.pipe(socket);
                socket.on('close', () => {
                    if ( uid in socketsMap)
                        delete socketsMap[uid];
                    proxySocket.end();
                    remoteSocket.end();
                });
                remoteSocket.on('close', () => {
                    if ( uid in socketsMap)
                        delete socketsMap[uid];
                    proxySocket.end();
                    socket.end();
                });
                resolve({proxySocket: proxySocket, remoteSocket: remoteSocket});
            };
            proxySocket.on('data', init);
        });
    }

    close() {
        for (let uid in this._socketsMap)
            this._socketsMap[uid].end();
        if (this._proxyServer) {
            this._proxyServer.close();
            this._proxyServer = null;
        }
    }
}

module.exports = {
    JsonSocketAdapter,    
    SocketProxyServer
};
