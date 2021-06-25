#!/usr/bin/env node
// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

// load thingpedia to initialize the polyfill
import 'thingpedia';

import express from 'express';
import WebSocket from "ws";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const wsjs = require('ws');

import * as http from 'http';
import * as stream from 'stream';
import * as rpc from 'transparent-rpc';
import * as argparse from 'argparse';

import PlatformModule, { PlatformOptions } from './platform';
import JsonDatagramSocket from '../util/json_datagram_socket';
import * as i18n from '../util/i18n';
import Engine from './engine';

interface EngineState {
    userId : number;
    running : boolean;
    sockets : Set<rpc.Socket>;
    stopped : boolean;
    engine ?: Engine;
}

class Worker {
    private app : express.Application;
    private server : http.Server;
    private wss : WebSocket.Server;
    private engines : Map<number, EngineState>; 
    private stopped : boolean;

    constructor(port : number) {
        this.engines = new Map<number, EngineState>();
        this.stopped = false;
        this.app = express();
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.set('port', port);

        this.server = http.createServer(this.app);
        this.server.on('upgrade', (request, socket, head) => {
          const pathname = new URL(request.url).pathname;          
          if (pathname === '/engine') {
              this.wss.handleUpgrade(request, socket, head, (ws) => {
                  this.wss.emit('connection', ws, request);
              });
          } else {
            console.log('Error http upgrade path: ' + pathname);
            socket.destroy();
          }
        });

        this.wss = new WebSocket.Server({ noServer: true });
        this.wss.on('connection', async (ws : WebSocket, request : http.IncomingMessage) => {
            console.log('connect engine request:' + request);
            this.connectWSEngine(ws);
        });

        this.app.post('/runEngine', (req, res, next) => {
            Promise.resolve().then(async () => {
                res.json({"result": "ok", "data": this.runEngine(req.body)});
            }).catch(next);
        });

        this.app.get('/killEngine', (req, res, next) => {
            Promise.resolve().then(async () => {
                res.json({"result": "ok", "data": this.killEngine(Number(req.query.userid))});
            }).catch(next);
        });

        this.app.get('/engineStatus', (req, res, next) => {
            Promise.resolve().then(async () => {
                res.json({"result": "ok", "data": this.engineStatus(Number(req.query.userid))});
            }).catch(next);
        });
    } 

     async start() {
        // '::' means the same as 0.0.0.0 but for IPv6
        // without it, node.js will only listen on IPv4
        return new Promise<void>((resolve, reject) => {
            this.server.listen(this.app.get('port') as number, '::', () => {
                resolve();
            });
        }).then(() => {
            console.log('Express server listening on port ' + this.app.get('port'));
        });
    }

    handleSignal() {
        for (const obj of this.engines.values()) {
            console.log('Stopping engine of ' + obj.userId);
            obj.stopped = true;
            if (obj.running)
                obj.engine!.stop();
            for (const sock of obj.sockets)
                sock.end();
        }

        this.stopped = true;
        if (process.connected)
            process.disconnect();

        // give ourselves 10s to die gracefully, then just exit
        setTimeout(() => {
            process.exit();
        });
    }

    runEngine(options : PlatformOptions) : boolean {
        console.log(`runEngine ${JSON.stringify(options)}`);
        if (this.engines.get(options.userId))
            return true;

        const platform = PlatformModule.newInstance(null, options);

        const obj : EngineState = {
            userId: options.userId,
            running: false,
            sockets: new Set,
            stopped: false
        };

        platform.init().then(() => {
            obj.engine = new Engine(platform, {
                thingpediaUrl: PlatformModule.thingpediaUrl,
                nluModelUrl: PlatformModule.nlServerUrl,
                notifications: PlatformModule.notificationConfig,
                // nlg will be set to the same URL
            });
            if (this.stopped || obj.stopped)
                return Promise.resolve();
            return obj.engine.open();
        }).then(() => {
            if (this.stopped || obj.stopped)
                return Promise.resolve();

            obj.running = true;
            return obj.engine!.run();
        }).then(() => {
            return obj.engine!.close();
        }).catch((e) => {
            console.error('Engine ' + options.userId + ' had a fatal error: ' + e.message);
            console.error(e.stack);
            this.engines.delete(options.userId);
        });

        this.engines.set(options.userId, obj);
        return true;
    }

    killEngine(userId : number) : boolean {
        console.log(`Killing engine ${userId}`);
        const obj = this.engines.get(userId);
        if (!obj)
            return false;
        this.engines.delete(userId);
        obj.stopped = true;
        if (!obj.engine)
            return false;
        obj.engine.stop();
        for (const sock of obj.sockets)
            sock.end();
        return true;
    }

   engineStatus(userId : number) : string {
        console.log(`Status of engine ${userId}`);
        const obj = this.engines.get(userId);
        if (!obj || !obj.running)
            return "stopped";
        return "running";
    }

    handleDirectSocket(userId : number, replyId : number, socket : stream.Duplex) {
        console.log('Handling direct connection for ' + userId);

        const rpcSocket = new rpc.Socket(new JsonDatagramSocket(socket, socket, 'utf8'));
        rpcSocket.on('error', (e) => {
            console.log('Error on direct RPC socket: ' + e.message);
        });

        const obj = this.engines.get(userId);
        if (!obj || !obj.engine) {
            console.log('Could not find an engine with the required user ID');
            rpcSocket.call(replyId, 'error', ['Invalid user ID ' + userId]);
            rpcSocket.end();
            return;
        }

        const platform = obj.engine.platform;
        rpcSocket.call(replyId, 'ready', [
            obj.engine,
            platform.getCapability('websocket-api'),
            platform.getCapability('webhook-api')
        ]);

        obj.sockets.add(rpcSocket);
        rpcSocket.on('close', () => {
            obj.sockets.delete(rpcSocket);
        });
    }

    async connectWSEngine(ws : WebSocket) {
        console.log('connecting engine ...');
        const socket = wsjs.createWebSocketStream(ws);
        const jsonSocket = new JsonDatagramSocket(socket, socket, 'utf-8');
        const initListener = (msg : any) => {
            console.log(`=== received msg: ${msg}`);
            if (msg.control === 'new-object')
                return;
            jsonSocket.removeListener('data', initListener);
            if (msg.control === 'direct') {
                console.log(`=== connecting rpc socket to engine`);
                try {
                    this.handleDirectSocket(msg.target, msg.replyId, socket);
                } catch(e) {
                    console.log(`=== sending socket to child err ${e.message}`);
                    jsonSocket.write({ error: e.message, code: e.code });
                    jsonSocket.end();
                }
            } else {
                console.log(`=== invalid message`);
                jsonSocket.write({ error: 'invalid initialization message' });
                jsonSocket.end();
            }
        };
        jsonSocket.on('data', initListener);
    }

}

export function initArgparse(subparsers : argparse.SubParser) {
    const parser = subparsers.add_parser('run-worker', {
        description: 'Run the Worker Almond process'
    });
    parser.add_argument('--port', {
        type: 'int',
        help: 'Port to listen',
        default: 8100,
    });
    parser.add_argument('--shared', {
        action: 'store_true',
        help: 'Run as a shared (multi-user) process',
        default: false,
    });
    parser.add_argument('-l', '--locale', {
        action: 'append',
        default: [],
        help: 'Enable this language',
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
    parser.add_argument('--notification-config', {
        required: true,
        help: 'Notification Configuration',
    });
    parser.add_argument('--faq-models', {
        required: true,
        help: 'FAQ model configuration',
    });
}

export async function main(argv : any) {
    i18n.init(argv.locale);
    PlatformModule.init(argv);
    const worker = new Worker(argv.port);
    process.on('SIGINT', () => { worker.handleSignal(); });
    process.on('SIGTERM', () => { worker.handleSignal(); });
    worker.start();
}