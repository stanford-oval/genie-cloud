#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const assert = require('assert');
const events = require('events');
const rpc = require('transparent-rpc');
const net = require('net');
const sockaddr = require('sockaddr');
const os = require('os');

const EngineManager = require('./enginemanager');
const JsonDatagramSocket = require('../util/json_datagram_socket');
const { InternalError } = require('../util/errors');

const Config = require('../config');
assert(Array.isArray(Config.THINGENGINE_MANAGER_ADDRESS));

class ControlSocket extends events.EventEmitter {
    constructor(engines, socket) {
        super();

        this._socket = socket;
        const jsonSocket = new JsonDatagramSocket(socket, socket, 'utf8');

        this._authenticated = Config.THINGENGINE_MANAGER_AUTHENTICATION === null;
        const initListener = (msg) => {
            if (msg.control === 'auth') {
                if (msg.token === Config.THINGENGINE_MANAGER_AUTHENTICATION) {
                    this._authenticated = true;
                } else {
                    this.emit('close');
                    jsonSocket.write({ error: 'invalid authentication token' });
                    jsonSocket.end();
                    jsonSocket.removeListener('data', initListener);
                }
                return;
            }
            if (!this._authenticated) {
                this.emit('close');
                jsonSocket.write({ error: 'expected authentication' });
                jsonSocket.end();
                jsonSocket.removeListener('data', initListener);
                return;
            }

            // ignore new-object messages that are sent during initialization
            // of the rpc socket
            if (msg.control === 'new-object')
                return;

            jsonSocket.removeListener('data', initListener);
            if (msg.control === 'direct') {
                socket.pause();
                this.emit('close');
                this._socket = null;
                engines.sendSocket(msg.target, msg.replyId, socket).catch((e) => {
                    jsonSocket.write({ error: e.message, code: e.code });
                    jsonSocket.end();
                });
            } else if (msg.control === 'master') {
                this._rpcSocket = new rpc.Socket(jsonSocket);
                this._rpcSocket.on('close', () => this.emit('close'));
                this._rpcSocket.on('error', () => {
                    // ignore the error, the connection will be closed soon
                });

                const id = this._rpcSocket.addStub(engines);
                jsonSocket.write({ control: 'ready', rpcId: id });
            } else {
                this.emit('close');
                jsonSocket.write({ error: 'invalid initialization message' });
                jsonSocket.end();
            }
        };
        jsonSocket.on('data', initListener);
    }

    end() {
        this._socket.end();
    }
}

class ControlSocketServer {
    constructor(engines, shardId, k8s) {
        this._server = net.createServer();
        // In K8S, we assume the container port is the same as the service port
        if (k8s)
            this._address = sockaddr(`${process.env.HOSTNAME}:${process.env.ALMOND_BACKEND_SERVICE_PORT}`)
        else
            this._address = sockaddr(Config.THINGENGINE_MANAGER_ADDRESS[shardId]);
        this._connections = new Set;
        this._server.on('connection', (socket) => {
            const control = new ControlSocket(engines, socket);
            this._connections.add(control);
            control.on('close', () => this._connections.delete(control));
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            this._server.listen(this._address, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    stop() {
        for (var conn of this._connections) {
            try {
                conn.end();
            } catch(e) {
                console.error(`Failed to stop one connection: ${e.message}`);
            }
        }
        this._server.close();
    }
}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.add_parser('run-almond', {
            description: 'Run the master Web Almond process'
        });
        parser.add_argument('-s', '--shard', {
            required: false,
            type: Number,
            help: 'Shard number for this process',
            default: 0
        });
        parser.add_argument('--k8s', {
            action: 'store_true',
            default: false,
            help: 'Enable running in kubernetes. The shard number will be inferred from the hostname.'
        });
    },

    main(argv) {
        if (argv.k8s) {
            console.log(`Running in Kubernetes.`);
            const hostname = os.hostname();
            const match = /-([0-9]+)$/.exec(hostname);
            argv.shard = parseInt(match[1], 10);
            console.log(`Inferred hostname: ${hostname}, shard: ${argv.shard}`);
        }

        if (Number.isNaN(argv.shard) || argv.shard < 0 || argv.shard >= Config.THINGENGINE_MANAGER_ADDRESS.length)
            throw new InternalError('E_INVALID_CONFIG', `Invalid shard number ${argv.shard}, must be between 0 and ${Config.THINGENGINE_MANAGER_ADDRESS.length-1}`);

        const enginemanager = new EngineManager(argv.shard);

        const controlSocket = new ControlSocketServer(enginemanager, argv.shard, argv.k8s);

        controlSocket.start().then(() => {
            return enginemanager.start();
        }).catch((e) => {
            console.error('Failed to start: ' + e.message);
            console.error(e.stack);
            process.exit(1);
        });

        let _stopping = false;
        async function stop() {
            if (_stopping)
                return;
            _stopping = true;
            try {
                await Promise.all([
                    enginemanager.stop(),
                    controlSocket.stop()
                ]);
            } catch(e) {
                console.error('Failed to stop: ' + e.message);
                console.error(e.stack);
                process.exit(1);
            }
            process.exit(0);
        }

        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
    }
};
