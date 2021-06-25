/* eslint-disable @typescript-eslint/no-var-requires */
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


const wsjs = require('ws');
const rpc = require('transparent-rpc');

import assert from 'assert';
import http from 'http';
import os from 'os';
import path from 'path';
import {Server} from 'ws';
import  WebSocket from 'ws';

import JsonWebSocketAdapter from '../../src/util/json_websocket';

export default function testSocketJsonAdapterForRpcOverWebSocket() {
    const server = http.createServer();
    const sockPath = path.join(
        os.tmpdir(),
        `ws.${ new Date().getTime().toString()}.sock`
    );
   server.listen(sockPath, () => {
       const wss = new Server({ server });
       wss.on('connection', async (ws, req) => {
           const socket = new JsonWebSocketAdapter(wsjs.createWebSocketStream(ws));
           const rpcSocket = new rpc.Socket(socket);
           const stub = {
               $rpcMethods: ['frobnicate'],
               frobnicate(x : any) {
                   assert.strictEqual(x, 'x');
                   return 42;
               }
           };
           const id = rpcSocket.addStub(stub);
           socket.write({ control: 'ready', rpcId: id });
       });

       const ws = new WebSocket(`ws+unix://${sockPath}:/foo?bar=bar`);
       const s1 = new JsonWebSocketAdapter(wsjs.createWebSocketStream(ws));
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