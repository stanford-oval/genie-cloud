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
'use strict';


const assert = require('assert');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const rpc = require('transparent-rpc');

const JsonDatagramSocket = require('../../util/json_datagram_socket');
const { SocketProxyServer, JsonSocketAdapter } = require('../../util/socket_utils'); 

function testSocketJsonAdapterForRpcOverWebSocket() {
    const server = http.createServer();
    const sockPath = path.join(
        os.tmpdir(),
        `ws.${ new Date().getTime().toString()}.sock`
    );
   server.listen(sockPath, () => {
       const wss = new WebSocket.Server({ server });
       wss.on('connection', async (ws, req) => {
           const socket = new JsonSocketAdapter(WebSocket.createWebSocketStream(ws));
           const rpcSocket = new rpc.Socket(socket);
           const stub = {
               $rpcMethods: ['frobnicate'],
               frobnicate(x) {
                   assert.strictEqual(x, 'x');
                   return 42;
               }
           };
           const id = rpcSocket.addStub(stub);
           socket.write({ control: 'ready', rpcId: id });
       });

       const ws = new WebSocket(`ws+unix://${sockPath}:/foo?bar=bar`);
       const s1 = new JsonSocketAdapter(WebSocket.createWebSocketStream(ws));
       const rpcSocket = new rpc.Socket(s1);

       s1.on('data', async (msg) => {
           if (msg.control === 'ready') {
              try {
                  const result = await rpcSocket.call(msg.rpcId, 'frobnicate', ['x']);
                  assert.strictEqual(result, 42);
              } finally {
                  wss.close();
                  server.close();
              }
           }
       });
   });
}

function testSocketProxyServerWithIPC() {
    const socketProxyServer = new SocketProxyServer();
    const server = http.createServer();
    const sockPath = path.join(os.tmpdir(), `ws.${ new Date().getTime().toString()}.sock`);
    const child = require('child_process').fork('test_socket_utils_child.js');
    
    socketProxyServer.start();
    server.listen(sockPath, async () => {
        const wss = new WebSocket.Server({ server });
        wss.on('connection', async (ws, req) => {
            const socket = WebSocket.createWebSocketStream(ws);
            const socks = await socketProxyServer.newProxySocket(socket);
            child.send('socket', socks.remoteSocket);
        });

        const ws = new WebSocket(`ws+unix://${sockPath}:/foo?bar=bar`);
        const socket = WebSocket.createWebSocketStream(ws);
        const jsonSocket = new JsonDatagramSocket(socket, socket, 'utf-8');
        const rpcSocket = new rpc.Socket(jsonSocket);

        jsonSocket.on('data', async (msg) => {
            if (msg.control === 'ready') {
               try {
                   const result = await rpcSocket.call(msg.rpcId, 'frobnicate', ['x']);
                   assert.strictEqual(result, 42);
               } finally {
                   socketProxyServer.close();
                   wss.close();
                   server.close();
                   child.send('exit');
               }
            }
        });
    });
}

function main() {
    testSocketJsonAdapterForRpcOverWebSocket();
    testSocketProxyServerWithIPC();
}

module.exports = main;
if (!module.parent)
    main();
