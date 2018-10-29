#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;
const events = require('events');
const rpc = require('transparent-rpc');
const net = require('net');
const sockaddr = require('sockaddr');

const EngineManager = require('./enginemanager');
const JsonDatagramSocket = require('../util/json_datagram_socket');

const Config = require('../config');

class DirectSocketServer {
    constructor(engines, path) {
        this._server = net.createServer();

        this._server.on('connection', (socket) => {
            const jsonSocket = new JsonDatagramSocket(socket, socket, 'utf8');

            jsonSocket.on('data', (msg) => {
                if (msg.control === 'init') {
                    try {
                        engines.sendSocket(msg.target, msg.replyId, socket);
                    } catch(e) {
                        jsonSocket.write({ error: e.message });
                        jsonSocket.end();
                    }
                }
            });
        });
    }

    start() {
        return Q.ninvoke(this._server, 'listen', sockaddr(Config.THINGENGINE_DIRECT_ADDRESS));
    }

    stop() {
        return Q.ninvoke(this._server, 'close');
    }
}

class ControlSocket extends events.EventEmitter {
    constructor(engines, socket) {
        super();

        this._socket = socket;
        this._jsonDatagramSocket = new JsonDatagramSocket(socket, socket, 'utf8');
        this._rpcSocket = new rpc.Socket(this._jsonDatagramSocket);
        this._rpcSocket.on('close', () => this.emit('close'));
        this._rpcSocket.on('error', () => {
            // ignore the error, the connection will be closed soon
        });

        const id = this._rpcSocket.addStub(engines);
        this._jsonDatagramSocket.write({ control: 'ready', rpcId: id });
    }

    end() {
        this._socket.end();
    }
}

class ControlSocketServer {
    constructor(engines) {
        this._server = net.createServer();

        this._connections = new Set;
        this._server.on('connection', (socket) => {
            const control = new ControlSocket(engines, socket);
            this._connections.add(control);
            control.on('close', () => this._connections.delete(control));
        });
    }

    start() {
        return Q.ninvoke(this._server, 'listen', sockaddr(Config.THINGENGINE_MANAGER_ADDRESS));
    }

    stop() {
        for (var conn of this._connections) {
            try {
                conn.end();
            } catch(e) {
                console.error(`Failed to stop one connection: ${e.message}`);
            }
        }
        return Q.ninvoke(this._server, 'close');
    }
}

function main() {
    const enginemanager = new EngineManager();

    const controlSocket = new ControlSocketServer(enginemanager);
    const directSocket = new DirectSocketServer(enginemanager);

    Promise.all([controlSocket.start(), directSocket.start()]).then(() => {
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
                directSocket.stop(),
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
main();
