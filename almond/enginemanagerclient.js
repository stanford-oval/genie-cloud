// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const net = require('net');
const events = require('events');
const rpc = require('transparent-rpc');
const sockaddr = require('sockaddr');

const JsonDatagramSocket = require('../util/json_datagram_socket');
const userToShardId = require('./shard');

const Config = require('../config');

var _instance;

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

        var deleted = false;
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

        var defer = Q.defer();
        rpcSocket.on('error', (err) => {
            // if we still can, catch the error early and fail the request
            defer.reject(err);
        });
        var initError = (msg) => {
            if (msg.error)
                defer.reject(new Error(msg.error));
        };
        jsonSocket.on('data', initError);

        var stub = {
            ready(apps, devices, messaging, websocket, webhook, assistant) {
                jsonSocket.removeListener('data', initError);

                defer.resolve({
                    apps,
                    devices,
                    messaging,
                    websocket,
                    webhook,
                    assistant
                });
            },
            error(message) {
                defer.reject(new Error(message));
            },

            $rpcMethods: ['ready', 'error']
        };
        var replyId = rpcSocket.addStub(stub);
        jsonSocket.write({ control:'direct', target: userId, replyId: replyId });

        this._cachedEngines.set(userId, {
            engine: defer.promise,
            socket: rpcSocket
        });
        return defer.promise;
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

    isRunning(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
             return Q(false);
        return this._rpcControls[shardId].isRunning(userId);
    }

    getProcessId(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            return Q(-1);
        return this._rpcControls[shardId].getProcessId(userId);
    }

    startUser(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            return Q.reject(new Error('EngineManager died'));
        return this._rpcControls[shardId].startUser(userId);
    }

    killUser(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            return Q.reject(new Error('EngineManager died'));
        return this._rpcControls[shardId].killUser(userId);
    }

    deleteUser(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            return Q.reject(new Error('EngineManager died'));
        return this._rpcControls[shardId].deleteUser(userId);
    }

    clearCache(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            return Q.reject(new Error('EngineManager died'));
        return this._rpcControls[shardId].clearCache(userId);
    }

    restartUser(userId) {
        const shardId = userToShardId(userId);
        if (!this._rpcControls[shardId])
            return Q.reject(new Error('EngineManager died'));
        return this._rpcControls[shardId].restartUser(userId);
    }

    restartUserWithoutCache(userId) {
        if (!this._rpcControl)
            return Q.reject(new Error('EngineManager died'));
        return this._rpcControl.restartUserWithoutCache(userId);
    }
}

module.exports = EngineManagerClient;
