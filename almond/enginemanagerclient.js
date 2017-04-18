// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const events = require('events');
const stream = require('stream');
const rpc = require('transparent-rpc');

const JsonDatagramSocket = require('./json_datagram_socket');

var _instance;

class EngineManagerClient extends events.EventEmitter {
    constructor() {
        super();
        this._cachedEngines = new Map;

        _instance = this;
    }

    getEngine(userId) {
        if (this._cachedEngines.has(userId)) {
            return this._cachedEngines.get(userId);
        }

        var directSocket = new net.Socket();
        directSocket.connect('./direct');

        var jsonSocket = new JsonDatagramSocket(directSocket, directSocket, 'utf8');
        var rpcSocket = new rpc.Socket(jsonSocket);

        var deleted = false;
        rpcSocket.on('close', () => {
            if (!deleted) {
                this._cachedEngines.delete(userId);
                this.emit('socket-closed', userId);
            }
            deleted = true;
        });

        var defer = Q.defer();
        rpcSocket.on('error', (err) => defer.reject(err));
        var initError = (msg) => {
            if (msg.error)
                defer.reject(new Error(msg.error));
        };
        jsonSocket.on('data', initError);

        var stub = {
            ready(engine, webhook, assistant) {
                jsonSocket.removeListener('data', initError);

                Q.all([engine.apps, engine.devices, engine.messaging]).spread((apps, devices, messaging) => {
                    return {
                        apps: apps,
                        devices: devices,
                        messaging: messaging,
                        webhook: webhook,
                        assistant: assistant
                    };
                }).done((obj) => defer.resolve(obj), (error) => defer.reject(error));
            },

            $rpcMethods: ['ready']
        };
        var replyId = rpcSocket.addStub(stub);
        jsonSocket.write({ control:'init', target: userId, replyId: replyId });

        this._cachedEngines.set(userId, defer.promise);
        return defer.promise;
    }

    dispatchWebhook(req, res) {
        var userId = req.params.user_id;
        var id = req.params.id;

        this.getEngine(userId).then((engine) => {
            return engine.webhook.handleCallback(id, req.method, req.query, req.headers, req.body)
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
        }).done();
    }

    start() {
        return Q.Promise((callback, errback) => {
            console.log('starting');
            this._controlSocket = new net.Socket();
            this._controlSocket.connect('./control');

            var jsonSocket = new JsonDatagramSocket(this._controlSocket, this._controlSocket, 'utf8');
            this._rpcSocket = new rpc.Socket(jsonSocket);

            var ready = (msg) => {
                if (msg.control === 'ready') {
                    console.log('Control channel to EngineManager ready');
                    this._rpcControl = this._rpcSocket.getProxy(msg.rpcId);
                    jsonSocket.removeListener('data', ready);
                    callback();
                }
            }
            jsonSocket.on('data', ready);
            this._rpcSocket.on('error', errback);
        });
    }

    stop() {
        this._rpcSocket.end();
    }

    isRunning(userId) {
        return this._rpcControl.isRunning(userId);
    }

    getProcessId(userId) {
        return this._rpcControl.getProcessId(userId);
    }

    startUser(userId) {
        return this._rpcControl.startUser(userId);
    }

    killUser(userId) {
        return this._rpcControl.killUser(userId);
    }

    deleteUser(userId) {
        return this._rpcControl.deleteUser(userId);
    }

    restartUser(userId) {
        return this._rpcControl.restartUser(userId);
    }

    static get() {
        return _instance;
    }
}

module.exports = EngineManagerClient;
