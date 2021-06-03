// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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


const net = require('net');
const events = require('events');
const rpc = require('transparent-rpc');
const sockaddr = require('sockaddr');

const JsonDatagramSocket = require('../util/json_datagram_socket');
const userToShardId = require('./shard');

const Config = require('../config');

let _instance;

function connectToMaster(shardId) {
    const shard = Config.THINGENGINE_MANAGER_ADDRESS[shardId];

    const socket = new net.Socket();
    socket.connect(sockaddr(shard));

    const jsonSocket = new JsonDatagramSocket(socket, socket, 'utf8');
    if (Config.THINGENGINE_MANAGER_AUTHENTICATION !== null)
        jsonSocket.write({ control: 'auth', token: Config.THINGENGINE_MANAGER_AUTHENTICATION });

    return jsonSocket;
}

class EngineManagerClient extends events.EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(Infinity);
        this._cachedEngines = new Map;

        this._expectClose = false;
        this._reconnectTimeout = null;

        _instance = this;

        // one control+socket per shard
        this._nShards = Config.THINGENGINE_MANAGER_ADDRESS.length;
        this._rpcControls = new Array(this._nShards);
        this._rpcSockets = new Array(this._nShards);
    }

    static get() {
        return _instance;
    }

    getEngine(userId) {
        if (this._cachedEngines.has(userId)) {
            let cached = this._cachedEngines.get(userId);
            return cached.engine;
        }

        const jsonSocket = connectToMaster(userToShardId(userId));
        const rpcSocket = new rpc.Socket(jsonSocket);

        let deleted = false;
        rpcSocket.on('close', () => {
            if (this._expectClose)
                return;

            console.log('Socket to user ID ' + userId + ' closed');
            if (!deleted) {
                this._cachedEngines.delete(userId);
                this.emit('socket-closed', userId);
            }
            deleted = true;
        });

        const promise = new Promise((resolve, reject) => {
            // if we still can, catch the error early and fail the request
            rpcSocket.on('error', reject);
            const initError = (msg) => {
                if (msg.error) {
                    const err = new Error(msg.error);
                    err.code = msg.code;
                    reject(err);
                }
            };
            jsonSocket.on('data', initError);

            const stub = {
                ready(engine, websocket, webhook) {
                    jsonSocket.removeListener('data', initError);
                    engine.websocket = websocket;
                    engine.webhook = webhook;

                    resolve(engine);
                },
                error(message) {
                    reject(new Error(message));
                },

                $rpcMethods: ['ready', 'error']
            };
            const replyId = rpcSocket.addStub(stub);
            jsonSocket.write({ control:'direct', target: userId, replyId: replyId });
        });
        this._cachedEngines.set(userId, {
            engine: promise,
            socket: rpcSocket
        });
        return promise;
    }

    dispatchWebhook(userId, req, res) {
        const id = req.params.id;

        return this.getEngine(userId).then((engine) => {
            return engine.webhook.handleCallback(id, req.method, req.query, req.headers, req.body);
        }).then((result) => {
            if (result) {
                if (result.contentType)
                    res.type(result.contentType);
                res.status(result.code).send(result.response);
            } else {
                res.status(200).json({ result: 'ok' });
            }
        }).catch((err) => {
            res.status(400).json({ error: err.message });
        });
    }

    _connect(shardId) {
        if (this._rpcControls[shardId])
            return;

        const jsonSocket = connectToMaster(shardId);
        const rpcSocket = new rpc.Socket(jsonSocket);
        this._rpcSockets[shardId] = rpcSocket;

        const ready = (msg) => {
            if (msg.control === 'ready') {
                console.log(`Control channel to EngineManager[${shardId}] ready`);
                this._rpcControls[shardId] = rpcSocket.getProxy(msg.rpcId);
                jsonSocket.removeListener('data', ready);
            }
        };
        jsonSocket.on('data', ready);
        jsonSocket.write({ control:'master' });
        rpcSocket.on('close', () => {
            this._rpcSockets[shardId] = null;
            this._rpcControls[shardId] = null;

            if (this._expectClose)
                return;

            console.log(`Control channel to EngineManager[${shardId}] severed`);
            console.log('Reconnecting in 10s...');
            setTimeout(() => {
                this._connect(shardId);
            }, 10000);
        });
        rpcSocket.on('error', () => {
            // ignore the error, the socket will be closed soon and we'll deal with it
        });
    }

    start() {
        for (let i = 0; i < this._nShards; i++)
            this._connect(i);
    }

    stop() {
        _instance = null;
        this._expectClose = true;

        for (let engine of this._cachedEngines.values())
            engine.socket.end();
        this._cachedEngines.clear();

        for (let i = 0; i < this._nShards; i++) {
            if (!this._rpcSockets[i])
                continue;
            this._rpcSockets[i].end();
        }
    }

    async killAllUsers() {
        let ok = true;
        for (let i = 0; i < this._nShards; i++) {
            if (!this._rpcControls[i]) {
                ok = false;
                continue;
            }
            if (!await this._rpcControls[i].killAllUsers())
                ok = false;
        }
        return ok;
    }

    async isRunning(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
             return false;
        return this._rpcControls[shardId].isRunning(userId);
    }

    async getProcessId(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            return -1;
        return this._rpcControls[shardId].getProcessId(userId);
    }

    async startUser(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            throw new Error('EngineManager died');
        return this._rpcControls[shardId].startUser(userId);
    }

    async killUser(userId) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            throw new Error('EngineManager died');
        return this._rpcControls[shardId].killUser(userId);
    }

    async deleteUser(userId) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            throw new Error('EngineManager died');
        return this._rpcControls[shardId].deleteUser(userId);
    }

    async clearCache(userId) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            throw new Error('EngineManager died');
        return this._rpcControls[shardId].clearCache(userId);
    }

    async restartUser(userId) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            throw new Error('EngineManager died');
        return this._rpcControls[shardId].restartUser(userId);
    }

    async restartUserWithoutCache(userId) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            throw new Error('EngineManager died');
        return this._rpcControls[shardId].restartUserWithoutCache(userId);
    }
}

module.exports = EngineManagerClient;
