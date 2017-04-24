// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const events = require('events');
const stream = require('stream');
const rpc = require('transparent-rpc');
const net = require('net');

const EngineManager = require('./enginemanager');
const JsonDatagramSocket = require('./json_datagram_socket');

class DirectSocketServer {
    constructor(engines, path) {
        this._server = net.createServer();

        this._server.on('connection', (socket) => {
            var jsonSocket = new JsonDatagramSocket(socket, socket, 'utf8');

            jsonSocket.on('data', function(msg) {
                if (msg.control === 'init') {
                    try {
                        engines.sendSocket(msg.target, msg.replyId, socket);
                    } catch(e) {
                        jsonSocket.write({ error: e.message });
                        jsonSocket.end();
                        return;
                    }
                }
            });
        });
    }

    start() {
        return Q.ninvoke(this._server, 'listen', './direct');
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

        // wrap EngineManager into its API, as a new object (or RpcSocket will complain)

        var wrapped = { $rpcMethods: [] };
        function wrap(api) {
            wrapped[api] = function() { return engines[api].apply(engines, arguments); };
            wrapped.$rpcMethods.push(api);
        }
        wrap('isRunning');
        wrap('getProcessId');
        wrap('startUser');
        wrap('killUser');
        wrap('deleteUser');
        wrap('restartUser');

        var id = this._rpcSocket.addStub(wrapped);
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
            var control = new ControlSocket(engines, socket);
            this._connections.add(control);
            control.on('close', () => this._connections.delete(control));
        });
    }

    start() {
        return Q.ninvoke(this._server, 'listen', './control');
    }

    stop() {
        for (var conn of this._connections)
            conn.end();
        return Q.ninvoke(this._server, 'close');
    }
}

function main() {
    var enginemanager = new EngineManager();

    var controlSocket = new ControlSocketServer(enginemanager);
    var directSocket = new DirectSocketServer(enginemanager);

    Q.all([controlSocket.start(), directSocket.start()]).then(() => {
        return enginemanager.start();
    }).done();

    function stop() {
        return Q.all([enginemanager.stop(), directSocket.stop(), controlSocket.stop()]).catch((e) => {
            console.error('Failed to stop: ' + e.message);
            console.error(e.stack);
            process.exit(1);
        }).then(() => process.exit(0));
    }

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}
main();
