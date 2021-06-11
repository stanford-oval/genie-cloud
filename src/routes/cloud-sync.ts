// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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

import type WebSocket from 'ws';
import type rpc from 'transparent-rpc';

import EngineManager from '../almond/enginemanagerclient';
import type { WebSocketWrapper } from '../almond/platform';

export class CloudSyncWebsocketDelegate implements rpc.Stubbable {
    $rpcMethods = ['ping', 'pong', 'terminate', 'send'] as const;
    $free ?: () => void;
    private _ws : WebSocket;
    private _remote : rpc.Proxy<WebSocketWrapper>|null;
    private _buffer : string[];

    constructor(ws : WebSocket) {
        this._ws = ws;
        this._remote = null;
        this._buffer = [];

        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            if (this.$free)
                this.$free();
        });
        ws.on('message', async (data) => {
            if (typeof data !== 'string')
                return;

            if (this._remote !== null) {
                try {
                    await this._remote.onMessage(data);
                } catch(e) {
                    console.error('Failed to relay websocket message: ' + e.message);
                    this._ws.close();
                }
            } else {
                this._buffer.push(data);
            }
        });
    }

    async setRemote(remote : rpc.Proxy<WebSocketWrapper>) {
        this._remote = remote;
        this._ws.on('close', async (code) => {
            try {
                await remote.onClose(code);
            } catch(e) {
                // ignore
            }
            remote.$free();
        });
        for (const data of this._buffer)
            await remote.onMessage(data);
    }

    ping() {
        this._ws.ping();
    }

    pong() {
        this._ws.pong();
    }

    send(data : string) {
        this._ws.send(data);
    }

    terminate() {
        this._ws.terminate();
    }

    async setUser(userId : number) {
        try {
            const engine = await EngineManager.get().getEngine(userId);

            const onclosed = (id : number) => {
                if (id === userId)
                    this._ws.close();
                EngineManager.get().removeListener('socket-closed', onclosed);
            };
            EngineManager.get().on('socket-closed', onclosed);

            const remote = await engine.websocket.newConnection(this);
            await this.setRemote(remote);
        } catch(error) {
            console.error('Error in cloud-sync websocket: ' + error.message);

            // ignore "Not Opened" error in closing
            try {
                this._ws.close();
            } catch(e) { /**/ }
        }
    }
}

export function handle(ws : WebSocket) {
    return new CloudSyncWebsocketDelegate(ws);
}
