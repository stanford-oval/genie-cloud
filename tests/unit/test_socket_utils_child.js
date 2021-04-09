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
const JsonDatagramSocket = require('../../util/json_datagram_socket');
const rpc = require('transparent-rpc');

process.on('message', (m, socket) => {
    if (m === 'socket') {
        const jsonSocket = new JsonDatagramSocket(socket, socket, 'utf-8');
        const rpcSocket = new rpc.Socket(jsonSocket);
        const stub = {
            $rpcMethods: ['frobnicate'],
            frobnicate(x) {
                assert.strictEqual(x, 'x');
                return 42;
            }
        };
        const id = rpcSocket.addStub(stub);
        jsonSocket.write({ control: 'ready', rpcId: id });
    } else if (m === 'exit') {
        process.exit();
    }
});
