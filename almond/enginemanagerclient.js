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
"use strict";

const events = require('events');
const rpc = require('transparent-rpc');
const Tp = require('thingpedia');
const WebSocket = require('ws');

const JsonDatagramSocket = require('../util/json_datagram_socket');


var _instance;


class EngineManagerClient extends events.EventEmitter {
    constructor(controlUrl) {
        super();
        this._controlUrl = controlUrl;
        this.setMaxListeners(Infinity);
        this._cachedEngines = new Map;

        this._expectClose = false;
        this._reconnectTimeout = null;

        _instance = this;

        // one control+socket
        this._rpcControl = null;
        this._rpcSocket = null;
    }

    static get() {
        return _instance;
    }

    async getEngine(userId) {
        if (this._cachedEngines.has(userId)) {
            let cached = this._cachedEngines.get(userId);
            return cached.engine;
        }
        const engineUrl = await this.controlGet('engineUrl', userId);
        console.log(engineUrl);
        const ws = new WebSocket(engineUrl);
        const socket = WebSocket.createWebSocketStream(ws);
        const jsonSocket = new JsonDatagramSocket(socket, socket, 'utf-8');
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

    stop() {
        _instance = null;
        this._expectClose = true;

        for (let engine of this._cachedEngines.values())
            engine.socket.end();
        this._cachedEngines.clear();

        if (this._rpcSocket) {
            this._rpcSocket.end();
            this._rpcSocket = null;
        }
    }

    async controlGet(command, param) {
        let url = `${this._controlUrl}/${command}`;
        if (param || param === 0)
            url += `/${param}`;
        console.log(`http request ---> ${url}`);
        const response = await Tp.Helpers.Http.get(url);
        console.log(`http respone ---> ${response}`);
        if (response === 'undefined')
            return undefined;
        return JSON.parse(response);
    }

    async controlPost(command, params) {
        console.log(`http call ---> ${this._controlUrl}/${command}`);
        const response = await Tp.Helpers.Http.post(`${this._controlUrl}/${command}`, JSON.stringify(params), {
            dataContentType: 'application/json'
        });
        return JSON.parse(response);
    }

    killAllUsers() {
        return this.controlGet('killAllUsers');
    }

    async isRunning(userId) {
        return this.controlGet('isRunning', userId);
    }

    getProcessId(userId) {
        return this.controlGet('getProcessId', userId);
    }

    startUser(userId) {
        return this.controlGet('startUser', userId);
    }

    killUser(userId) {
        this._cachedEngines.delete(userId);
        return this.controlGet('killUser', userId);
    }

    deleteUser(userId) {
        this._cachedEngines.delete(userId);
        return this.controlGet('deleteUser', userId);
    }

    clearCache(userId) {
        this._cachedEngines.delete(userId);
        return this.controlGet('clearCache', userId);
    }

    restartUser(userId) {
        return this.controlGet('restartUser', userId);
    }

    restartUserWithoutCache(userId) {
        this._cachedEngines.delete(userId);
        return this.controlGet('restartUserWithoutCache', userId);
    }
}

module.exports = EngineManagerClient;
