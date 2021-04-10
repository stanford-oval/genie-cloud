#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const db = require('../util/db');
const user = require('../model/user');
const userToShardId = require('./shard');
const bodyParser = require('body-parser');

const rpc = require('transparent-rpc');
const argparse = require('argparse');

const { JsonSocketAdapter } = require('../util/socket_utils');
const { BadRequestError } = require('../util/errors');


function _json(res, result) {
    if (result === undefined) 
        res.send('undefined');
    else 
	res.json(result);
}

// TODO: Uncommet
//
// function _user(userId) {
//     return db.withClient((dbClient) => {
//         return user.get(dbClient, userId);
//     })
// }

// Used for test
function _user(userId) {
        if (userId === '1') {
            return {
                    id: '1',
                    cloud_id: '101',
                    auth_token: 'auth-token',
                    developer_key: null,
                    locale: 'en-US',
                    timezone: null,
                    storage_key: null,
                    model_tag: null
            };
        }
        if (userId === '3') {
            return {
                    id: '3',
                    cloud_id: '103',
                    auth_token: 'auth-token',
                    developer_key: null,
                    locale: 'en-US',
                    timezone: null,
                    storage_key: null,
                    model_tag: null
            };
        }
        return {
            id: '2',
            cloud_id: '102',
            auth_token: 'auth-token',
            developer_key: null,
            locale: 'en-US',
            timezone: null,
            storage_key: null,
            model_tag: null
         };
}

// TODO: uncomment
//    async function _getAllUsers(shardId) {
//        return db.withClient(async (client) => {
//            const rows = await user.getAllForShardId(client, shardId);
//            return Promise.all(rows.map((r) => {
//                // explicitly export user fields to worker nodes.
//                return {
//                    id: r.id,
//                    cloud_id: r.cloud_id,
//                    auth_token: r.auth_token,
//                    developer_key: r.developer_key,
//                    locale: r.locale,
//                    timezone: r.timezone,
//                    storage_key: r.storage_key,
//                    model_tag: r.model_tag
//                };
//            }));
//        });
//    }

// For test only
async function _getAllUsers(shardId) {
   const rows = [
       {
           id: '0',
           cloud_id: '100',
           auth_token: 'auth-token',
           developer_key: null,
           locale: 'en-US',
           timezone: null,
           storage_key: null,
           model_tag: null
       },
       {
           id: '1',
           cloud_id: '101',
           auth_token: 'auth-token',
           developer_key: null,
           locale: 'en-US',
           timezone: null,
           storage_key: null,
           model_tag: null
       }
   ];
   return Promise.all(rows.map((r) => {
       // explicitly export user fields to worker nodes.
       return {
           id: r.id,
           cloud_id: r.cloud_id,
           auth_token: r.auth_token,
           developer_key: r.developer_key,
           locale: r.locale,
           timezone: r.timezone,
           storage_key: r.storage_key,
           model_tag: r.model_tag
       };
   }));
}



class ControlServer {
    constructor(port) {
        this._sharedBackends = {};
        this._app = express();
        this._app.set('port', port);
        this._app.use(bodyParser.json());
        this._app.use(bodyParser.urlencoded({ extended: true }));

        this._app.post('/registerBackend', (req, res, next) => {
            Promise.resolve().then(async () => {
                _json(res, this._registerBackend(req.body.backend));
            }).catch(next);
        });

        this._app.get('/deregisterBackend', (req, res, next) => {
            Promise.resolve().then(async () => {
                _json(res, this._deregisterBackend(res.body.backend));
            }).catch(next);
        });

        this._app.get('/engineUrl/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
               const userId = req.params.userId;
               const backend = this._sharedBackends[userToShardId(userId)];
               _json(res, backend.engineUrl);
            }).catch(next);
        });


        this._app.get('/killAllUsers', (req, res, next) => {
            Promise.resolve().then(async () => {
                _json(res, this._killAllUsers());
            }).catch(next);
        });


        this._app.get('/isRunning/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
                const userId = req.params.userId;
                _json(res, await this._getBackend(userId).isRunning(userId));
            }).catch(next);
        });

        this._app.get('/getProcessId/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
                const userId = req.params.userId;
                _json(res, await this._getBackend(userId).getProcessId(userId));
            }).catch(next);
        });

        this._app.get('/startUser/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
                const userId = req.params.userId;
                _json(res, await this._getBackend(userId).startUser(_user(userId)));
            }).catch(next);
        });

        this._app.get('/killUser/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
                const userId = req.params.userId;
                _json(res ,await this._getBackend(userId).killUser(userId));
            }).catch(next);
        });

        this._app.get('/deleteUser/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
                const userId = req.params.userId;
                _json(res, await this._getBackend(userId).deleteUser(_user(userId)));
            }).catch(next);
        });

        this._app.get('/clearCache/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
                const userId = req.params.userId;
                _json(res, await this._getBackend(userId).clearCache(_user(userId)));
            }).catch(next);
        });

        this._app.get('/restartUser/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
                const userId = req.params.userId;
                _json(res, await this._getBackend(userId).restartUser(_user(userId)));
            }).catch(next);
        });

        this._app.get('/restartUserWithoutCache/:userId', (req, res, next) => {
            Promise.resolve().then(async () => {
                const userId = req.params.userId;
                _json(res, await this._getBackend(userId).restartUserWithoutCache(_user(userId)));
            }).catch(next);
        });

        this._server = http.createServer(this._app);
    }

    _getBackend(userId) {
        const shardId = userToShardId(userId);
        if (!(shardId in this._sharedBackends))
            throw new BadRequestError(`Invalid userId: ${userId}`);
        console.log(`shard id ${shardId}`);
        return this._sharedBackends[shardId].backend;
    }

    _registerBackend(backend) {
        console.log(`Registering backend ${JSON.stringify(backend)}`);
        if (this._sharedBackends[backend.shardId]) {
            console.log(`Backend ${backend.url} already connected`);
            return;
        }
        const ws = new WebSocket(backend.url);
        const jsonSocket = new JsonSocketAdapter(WebSocket.createWebSocketStream(ws));
        const rpcSocket = new rpc.Socket(jsonSocket);
        const connectedBackend = {
            backend: null,
            rpcSocket: rpcSocket,
            expectClose: false,
            url: backend.url,
            engineUrl: backend.engineUrl,
            shardId: backend.shardId
        };
        const ready = (msg) => {
            if (msg.control === 'ready') {
                jsonSocket.removeListener('data', ready);
                console.log(`Channel to backend ${backend.url} ready`);
                connectedBackend.backend = rpcSocket.getProxy(msg.rpcId);
                this._sharedBackends[backend.shardId] = connectedBackend;
                this._startBackend(connectedBackend);
            }
        };
        jsonSocket.on('data', ready);
        rpcSocket.on('close', () => {
            console.log(`Channel to backend ${backend.url} closing`);
            if (connectedBackend.expectClose)
                return;
            console.log(`Control channel to backend ${connectedBackend.url} severed`);
            console.log('Reconnecting in 10s...');
            setTimeout(() => {
                this._registerBackend(backend);
            }, 10000);
        });
        rpcSocket.on('error', () => {
            // ignore the error, the socket will be closed soon and we'll deal with it
        });
    }

    _deregisterBackend(backend) {
        if (!this._sharedBackends[backend.shardId]) {
            console.log(`Backend ${backend.url} already deregistered`);
            return;
        }
        console.log(`Deregistering backend ${backend.url}`);
        this._sharedBackends[backend.shardId].expecClose = true;
        this._sharedBackends[backend.shardId].rpcSocket.end();
        this._sharedBackends[backend.shardId] = null;
    }
     
    async _startBackend(connectedBackend) {
        const users = await _getAllUsers(connectedBackend.shardId);
        console.log(`Starting backend ${connectedBackend.shardId} ${connectedBackend.url}`);
        connectedBackend.backend.start(users);
    }

    async _killAllUsers() {
        for (let shardId in this._sharedBackends) {
            const backend = this._sharedBackends[shardId];
            if (backend)
                await backend.backend.killAllUsers();
        }
        return true;
    }


    async start() {
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


function main() {
    const parser = new argparse.ArgumentParser({
        add_help: true,
        description: 'Almond backend control process'
    });

    parser.add_argument('-p', '--port', {
        required: false,
        type: Number,
        help: 'Web server port',
        default: 8080
    });

    const argv = parser.parse_args();

    const controlServer = new ControlServer(argv.port);

    let _stopping = false;
    async function handleSignal() {
        if (_stopping)
            return;
        _stopping = true;
        try {
            await controlServer.stop();
        } catch(e) {
            console.error('Failed to stop: ' + e.message);
            console.error(e.stack);
            process.exit(1);
        }
        process.exit(0);
    }

  
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    controlServer.start().catch((e) => {
        console.error('Failed to start: ' + e.message);
        console.error(e.stack);
        process.exit(1);
    });
}

main();
