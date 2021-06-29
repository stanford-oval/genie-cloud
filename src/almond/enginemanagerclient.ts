// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as net from 'net';
import * as events from 'events';
import * as rpc from 'transparent-rpc';
import express from 'express';
import sockaddr from 'sockaddr';

import JsonDatagramSocket from '../util/json_datagram_socket';
import userToShardId from './shard';
import * as proto from './protocol';
import type Engine from './engine';
import type { WebSocketApi, WebhookApi } from './platform';
import type EngineManager from './enginemanager';
import EngineManagerClientK8s from './enginemanagerclient_k8s';

import * as Config from '../config';

let _instance : EngineManagerInterface;

function connectToMaster(shardId : number) {
    const shard = Config.THINGENGINE_MANAGER_ADDRESS[shardId];

    const socket = new net.Socket();
    socket.connect(sockaddr(shard));

    const jsonSocket = new JsonDatagramSocket<proto.MasterToFrontend, proto.FrontendToMaster>(socket, socket, 'utf8');
    if (Config.THINGENGINE_MANAGER_AUTHENTICATION !== null)
        jsonSocket.write({ control: 'auth', token: Config.THINGENGINE_MANAGER_AUTHENTICATION });

    return jsonSocket;
}

type EngineProxy = rpc.Proxy<Engine> & {
    websocket : rpc.Proxy<WebSocketApi>;
    webhook : rpc.Proxy<WebhookApi>;
}

interface CachedEngine {
    engine : Promise<EngineProxy>;
    socket : rpc.Socket;
}

interface EngineManagerInterface extends events.EventEmitter {
    getEngine(userId : number) : Promise<EngineProxy>;
    dispatchWebhook(userId : number, req : express.Request, res : express.Response) : void;
    start() : void;
    stop() : void;
    killAllUsers() : Promise<boolean>;
    isRunning(userId : number) : Promise<boolean>;
    getProcessId(userId : number) : Promise<number|string>;
    startUser(userId : number) : Promise<void>;
    killUser(userId : number) : Promise<void>;
    deleteUser(userId : number) : Promise<void>;
    clearCache(userId : number) : Promise<void>;
    restartUser(userId : number) : Promise<void>;
    restartUserWithoutCache(userId : number) : Promise<void>;
}

class EngineManagerClientImpl extends events.EventEmitter {
    private _cachedEngines : Map<number, CachedEngine>;
    private _expectClose : boolean;

    private _nShards : number;
    private _rpcControls : Array<rpc.Proxy<EngineManager>|null>;
    private _rpcSockets : Array<rpc.Socket|null>;

    constructor() {
        super();
        this.setMaxListeners(Infinity);
        this._cachedEngines = new Map;

        this._expectClose = false;

        _instance = this;

        // one control+socket per shard
        this._nShards = Config.THINGENGINE_MANAGER_ADDRESS.length;
        this._rpcControls = new Array(this._nShards);
        this._rpcSockets = new Array(this._nShards);
    }

    getEngine(userId : number) : Promise<EngineProxy> {
        if (this._cachedEngines.has(userId)) {
            const cached = this._cachedEngines.get(userId)!;
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

        const promise = new Promise<EngineProxy>((resolve, reject) => {
            // if we still can, catch the error early and fail the request
            rpcSocket.on('error', reject);
            const initError = (msg : proto.MasterToFrontend) => {
                if ('error' in msg) {
                    const err : Error & { code ?: string } = new Error(msg.error);
                    err.code = msg.code;
                    reject(err);
                }
            };
            jsonSocket.on('data', initError);

            const stub = {
                ready(engine : EngineProxy, websocket : rpc.Proxy<WebSocketApi>, webhook : rpc.Proxy<WebhookApi>) {
                    jsonSocket.removeListener('data', initError);
                    engine.websocket = websocket;
                    engine.webhook = webhook;

                    resolve(engine);
                },
                error(message : string) {
                    reject(new Error(message));
                },

                $rpcMethods: ['ready', 'error'] as const
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

    dispatchWebhook(userId : number, req : express.Request, res : express.Response) {
        const id = req.params.id;

        return this.getEngine(userId).then((engine) => {
            return engine.webhook.handleCallback(id, req.method as 'GET'|'POST',
                req.query as Record<string, string|string[]|undefined>, req.headers, req.body);
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

    private _connect(shardId : number) {
        if (this._rpcControls[shardId])
            return;

        const jsonSocket = connectToMaster(shardId);
        const rpcSocket = new rpc.Socket(jsonSocket);
        this._rpcSockets[shardId] = rpcSocket;

        const ready = (msg : proto.MasterToFrontend) => {
            if ('control' in msg && msg.control === 'ready') {
                console.log(`Control channel to EngineManager[${shardId}] ready`);
                this._rpcControls[shardId] = rpcSocket.getProxy(msg.rpcId) as rpc.Proxy<EngineManager>;
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
        this._expectClose = true;

        for (const engine of this._cachedEngines.values())
            engine.socket.end();
        this._cachedEngines.clear();

        for (let i = 0; i < this._nShards; i++) {
            const socket = this._rpcSockets[i];
            if (!socket)
                continue;
            socket.end();
        }
    }

    async killAllUsers() : Promise<boolean> {
        let ok = true;
        for (let i = 0; i < this._nShards; i++) {
            const ctrl = this._rpcControls[i];
            if (!ctrl) {
                ok = false;
                continue;
            }
            if (!await ctrl.killAllUsers())
                ok = false;
        }
        return ok;
    }

    async isRunning(userId : number) : Promise<boolean> {
        const shardId = userToShardId(userId);
        const ctrl = this._rpcControls[shardId];
        if (!ctrl)
             return false;
        return ctrl.isRunning(userId);
    }

    async getProcessId(userId : number) {
        const shardId = userToShardId(userId);
        const ctrl = this._rpcControls[shardId];
        if (!ctrl)
            return -1;
        return ctrl.getProcessId(userId);
    }

    async startUser(userId : number) {
        const shardId = userToShardId(userId);
        const ctrl = this._rpcControls[shardId];
        if (!ctrl)
            throw new Error('EngineManager died');
        return ctrl.startUser(userId);
    }

    async killUser(userId : number) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        const ctrl = this._rpcControls[shardId];
        if (!ctrl)
            throw new Error('EngineManager died');
        return ctrl.killUser(userId);
    }

    async deleteUser(userId : number) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        const ctrl = this._rpcControls[shardId];
        if (!ctrl)
            throw new Error('EngineManager died');
        return ctrl.deleteUser(userId);
    }

    async clearCache(userId : number) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        const ctrl = this._rpcControls[shardId];
        if (!ctrl)
            throw new Error('EngineManager died');
        return ctrl.clearCache(userId);
    }

    async restartUser(userId : number) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        const ctrl = this._rpcControls[shardId];
        if (!ctrl)
            throw new Error('EngineManager died');
        return ctrl.restartUser(userId);
    }

    async restartUserWithoutCache(userId : number) {
        this._cachedEngines.delete(userId);
        const shardId = userToShardId(userId);
        const ctrl = this._rpcControls[shardId];
        if (!ctrl)
            throw new Error('EngineManager died');
        return ctrl.restartUserWithoutCache(userId);
    }
}

export default class EngineManagerClient {
    constructor(useK8s : boolean, namespace : string) {
        if (useK8s)
            _instance = new EngineManagerClientK8s(namespace);
        else
            _instance = new EngineManagerClientImpl();
    }

    static get() : EngineManagerInterface {
        return _instance;
    }
}