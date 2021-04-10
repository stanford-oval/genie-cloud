#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2021 The Board of Trustees of the Leland Stanford Junior University
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

// load thingpedia to initialize the polyfill
require('thingpedia');

const Tp = require('thingpedia');
const os = require('os');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const EngineManager = require('./enginemanager');

const rpc = require('transparent-rpc');
const argparse = require('argparse');

const JsonDatagramSocket = require('../util/json_datagram_socket');
const { JsonSocketAdapter, SocketProxyServer } = require('../util/socket_utils');


class MasterServer {
    constructor(options) {
        this._options = options;
        this._engines = new Map;
        this._stopped = false;
        const enginemanager = new EngineManager(options);
        this._enginemanager = enginemanager;
        this._proxySocketServer = new SocketProxyServer();

	const masterServer = this;

        const backend_wss = new WebSocket.Server({ noServer: true });
        this._backend_wss = backend_wss;
        backend_wss.on('connection', (ws) => {
            console.log('---backend ws connection');
            const jsonSocket = new JsonSocketAdapter(WebSocket.createWebSocketStream(ws));
            const rpcSocket = new rpc.Socket(jsonSocket);
            const id = rpcSocket.addStub(enginemanager);
            jsonSocket.write({ control: 'ready', rpcId: id });
        });


        const engine_wss = new WebSocket.Server({ noServer: true });
        this._engine_wss = engine_wss;
        engine_wss.on('connection', async (ws, request) => {
            console.log('connect engine request:' + request);
            masterServer._connectEngine(ws);
        });

        this._app = express();
        this._app.set('port', options.port);

        this._server = http.createServer(this._app);
        this._server.on('upgrade', (request, socket, head) => {
          const pathname = url.parse(request.url).pathname;
          if (pathname === '/backend') {
              backend_wss.handleUpgrade(request, socket, head, (ws) => {
                  backend_wss.emit('connection', ws, request);
              });
          } else if (pathname === '/engine') {
              engine_wss.handleUpgrade(request, socket, head, (ws) => {
                  engine_wss.emit('connection', ws, request);
              });
          } else {
            console.log('Error http upgrade path: ' + pathname);
            socket.destroy();
          }
        });
    }


    async _connectEngine(ws) {
        console.log('connecting engine ...');
        const socket = WebSocket.createWebSocketStream(ws);
        const jsonSocket = new JsonDatagramSocket(socket, socket, 'utf-8');
        const proxySocks = await this._proxySocketServer.newProxySocket(socket);
        console.log('proxy socks created ...');
        const enginemanager = this._enginemanager;
        const initListener = (msg) => {
            console.log(`=== received msg: ${msg}`);
            if (msg.control === 'new-object')
                return;
            jsonSocket.removeListener('data', initListener);
            if (msg.control === 'direct') {
                console.log(`=== sending socket to child`);
                enginemanager.sendSocket(msg.target, msg.replyId, proxySocks.remoteSocket).catch((e) => {
                    console.log(`=== sending socket to child err ${e.message}`);
                    jsonSocket.write({ error: e.message, code: e.code });
                    jsonSocket.end();
                });
            } else {
                console.log(`=== sinvalid message`);
                this.emit('close');
                jsonSocket.write({ error: 'invalid initialization message' });
                jsonSocket.end();
            }
        };
        jsonSocket.on('data', initListener);
    }

    async start() {
        this._proxySocketServer.start(); 

        // '::' means the same as 0.0.0.0 but for IPv6
        // without it, node.js will only listen on IPv4
        return new Promise((resolve, reject) => {
            this._server.listen(this._app.get('port'), '::', (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        }).then(() => {
            console.log('Express server listening on port ' + this._app.get('port'));
            this._register();
        });
    }

    _register() {
        const backend = {
            url: `ws://${this._options.hostname}:${this._options.port}/backend`,
            engineUrl: `ws://${this._options.hostname}:${this._options.port}/engine`,
            shardId: this._options.shard,
        };
        console.log(`Registering backend: ${backend.url} shardId: ${backend.shardId}`);
        console.log(`POST ${this._options.control_url}/registerBackend  :` +  JSON.stringify({backend: backend}));
        Tp.Helpers.Http.post(`${this._options.control_url}/registerBackend`, JSON.stringify({backend: backend}), {
            dataContentType: 'application/json'
        });
    }

    stop() {
        console.log('Stopping server');
        for (let obj of this._engines.values()) {
            console.log('Stopping engine of ' + obj.cloudId);
            if (obj.running)
                obj.engine.stop();

            for (let sock of obj.sockets)
                sock.end();
        }

        this._stopped = true;

        // close the server asynchronously to avoid waiting on open
        // connections
        this._server.close((error) => {
            if (error) {
                console.log('Error stopping Express server: ' + error);
                console.log(error.stack);
            } else {
                console.log('Express server stopped');
            }
        });
        return Promise.resolve();
    }
}

MasterServer.prototype.$rpcMethods = ['runEngine', 'killEngine'];


function main() {
    const parser = new argparse.ArgumentParser({
        add_help: true,
        description: 'Worker Almond process'
    });
    parser.add_argument('--control-url', {
        required: true,
        help: 'Thingpedia URL',
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
    parser.add_argument('--shared', {
        action: 'store_true',
        help: 'Run as a shared (multi-user) process',
        default: false,
    });
    parser.add_argument('--supported-languages', {
        action: 'append',
        default: ['en-US'],
        help: 'Supported languages',
    });
    parser.add_argument('--thingpedia-url', {
        required: true,
        help: 'Thingpedia URL',
    });
    parser.add_argument('--oauth-redirect-origin', {
        required: true,
        help: 'OAuth Redirect Origin',
    });
    parser.add_argument('--nl-server-url', {
        required: true,
        help: 'NLP Server URL',
    });
    parser.add_argument('--with-thingpedia', {
        default: 'embedded',
        help: 'Thingpedia mode',
    });
    parser.add_argument('-p', '--port', {
        required: false,
        type: Number,
        help: 'Web server port',
        default: 8081
    });

    const argv = parser.parse_args();
    argv.hostname = os.hostname();
    if (argv.k8s) {
        console.log(`Running in Kubernetes.`);
        const match = /-([0-9]+)$/.exec(argv.hostname);
        argv.shard = parseInt(match[1], 10);
        console.log(`Inferred hostname: ${argv.hostname}, shardId: ${argv.shard}`);
    }

    const masterServer = new MasterServer(argv);

    let _stopping = false;
    async function handleSignal() {
        if (_stopping)
            return;
        _stopping = true;
        try {
            await masterServer.stop();
        } catch(e) {
            console.error('Failed to stop: ' + e.message);
            console.error(e.stack);
            process.exit(1);
        }
        process.exit(0);
    }

  
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    masterServer.start().catch((e) => {
        console.error('Failed to start: ' + e.message);
        console.error(e.stack);
        process.exit(1);
    });

}

main();
