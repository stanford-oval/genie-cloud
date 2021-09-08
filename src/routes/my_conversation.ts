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
import type express from 'express';
import * as rpc from 'transparent-rpc';
import type * as Genie from 'genie-toolkit';
import type * as Tp from 'thingpedia';

import type { ConversationWrapper, NotificationWrapper } from '../almond/engine';
import * as userModel from '../model/user';
import * as user from '../util/user';
import * as EngineManager from '../almond/enginemanagerclient';
import { BadRequestError } from '../util/errors';
import { makeRandom } from '../util/random';

import * as Config from '../config';

export function anonymous(ws : WebSocket, req : express.Request) {
    if (req.user) {
        ws.close();
        return;
    }

    user.getAnonymousUser(req.locale).then((user) => {
        return doConversation(user, true, ws, req.query);
    });
}

class WebsocketApiDelegate implements rpc.Stubbable {
    $rpcMethods = ['send'] as const;
    private _ws : WebSocket;

    constructor(ws : WebSocket) {
        this._ws = ws;
    }

    async send(data : any) {
        if (data.result && data.result.icon)
            data.result.icon = Config.CDN_HOST + '/icons/' + data.result.icon + '.png';
        else if (data.error && data.error.icon)
            data.error.icon = Config.CDN_HOST + '/icons/' + data.error.icon + '.png';

        try {
            this._ws.send(JSON.stringify(data));
        } catch(e) {
            // ignore if the socket is closed
            if (e.message !== 'not opened')
                throw e;
        }
    }
}

export function results(ws : WebSocket, req : express.Request, next : express.NextFunction) {
    const user = req.user!;

    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(user.id);
        const onclosed = (userId : number) => {
            if (userId === user.id)
                ws.close();
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        const delegate = new WebsocketApiDelegate(ws);
        let wrapper : rpc.Proxy<NotificationWrapper>|undefined = undefined;
        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            if (!wrapper)
                return;
            try {
                await wrapper.destroy();
            } catch(e) {
                // ignore errors if engine died
            }
            wrapper.$free();
            wrapper = undefined;
        });
        ws.on('ping', (data) => ws.pong(data));

        wrapper = await engine.addNotificationOutput(delegate);
    }).catch((error) => {
        console.error('Error in API websocket: ' + error.message);

        // ignore "Not Opened" error in closing
        try {
            ws.close();
        } catch(e) { /**/ }
    });
}


class WebsocketAssistantDelegate implements Genie.DialogueAgent.ConversationDelegate, rpc.Stubbable {
    $rpcMethods = ['setHypothesis', 'setExpected', 'addMessage', 'addDevice'] as const;
    private _ws : WebSocket;

    constructor(ws : WebSocket) {
        this._ws = ws;
    }

    async setHypothesis() {
        // voice doesn't go through SpeechHandler, hence hypotheses don't go through here!
    }

    async setExpected(what : string|null) {
        this._send(JSON.stringify({ type: 'askSpecial', ask: what }));
    }

    async addDevice(uniqueId : string, state : Tp.BaseDevice.DeviceState) {
        this._send(JSON.stringify({ type: 'new-device', uniqueId, state }));
    }

    async addMessage(msg : Genie.DialogueAgent.Protocol.Message) {
        this._send(JSON.stringify(msg));
    }

    private _send(data : string) {
        try {
            this._ws.send(data);
        } catch(e) {
            console.error(`Failed to send message on assistant websocket: ${e.message}`);
            // ignore "Not Opened" error in closing
            try {
                this._ws.close();
            } catch(e) { /**/ }
        }
    }
}

interface ConversationQueryParams {
    hide_welcome ?: '1'|''|undefined;
    id ?: string;
    flags ?: Record<string, unknown>;
    skip_history ?: '1'|''|undefined;
    sync_devices ?: '1'|''|undefined;
}

async function doConversation(user : userModel.RowWithOrg, anonymous : boolean, ws : WebSocket, query : ConversationQueryParams) {
    try {
        const engine = await EngineManager.get().getEngine(user.id);
        const onclosed = (userId : number) => {
            if (userId === user.id)
                ws.close();
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        const flags : Record<string, boolean> = {};
        if (query.flags) {
            for (const key in query.flags) {
                if (query.flags[key])
                    flags[key] = true;
            }
        }

        const options = {
            replayHistory: !query.skip_history,
            syncDevices: !!query.sync_devices,

            showWelcome: !query.hide_welcome,
            anonymous,
            dialogueFlags: flags,

            // in anonymous mode, set a very large timeout so we don't get recycled until the socket is closed
            // in user mode, we always share the same conversation so we set no inactivity timeout at all
            inactivityTimeout: anonymous ? (3600 * 1000) : -1
        };

        const delegate = new WebsocketAssistantDelegate(ws);

        let wrapper : rpc.Proxy<ConversationWrapper>|undefined;
        const id = query.id || (anonymous ? 'web-' + makeRandom(4) : 'main');
        ws.send(JSON.stringify({ type: 'id', id : id }));

        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            if (!wrapper)
                return;
            try {
                await wrapper.destroy();
            } catch(e) {
                // ignore errors if engine died
            }
            wrapper.$free();
            wrapper = undefined;
        });

        wrapper = await engine.getOrOpenConversation(id, delegate, options);
        ws.on('message', (data) => {
            Promise.resolve().then(async () => {
                if (!wrapper) // race condition, connection closed
                    return;
                try {
                    try {
                        const parsed = JSON.parse(data as string);
                        const platformData = {};
                        switch (parsed.type) {
                        case 'command':
                            await wrapper.handleCommand(parsed.text, platformData);
                            break;
                        case 'parsed':
                            await wrapper.handleParsedCommand(parsed.json, parsed.title, platformData);
                            break;
                        case 'tt':
                            await wrapper.handleThingTalk(parsed.code, platformData);
                            break;
                        case 'ping':
                            await wrapper.handlePing();
                            break;
                        default:
                            throw new BadRequestError('Invalid command type ' + parsed.type);
                        }
                    } catch(e) {
                        console.error(e.stack);
                        ws.send(JSON.stringify({ type: 'error', error: e.message, code: e.code }));
                    }
                } catch(e) {
                    // likely, the websocket is busted
                    console.error(`Failed to send error on conversation websocket: ${e.message}`);

                    // ignore "Not Opened" error in closing
                    try {
                        ws.close();
                    } catch(e) { /**/ }
                }
            });
        });
    } catch(error) {
        console.error('Error in conversation websocket: ' + error.message);

        // ignore "Not Opened" error in closing
        try {
            ws.close();
        } catch(e) { /**/ }
    }
}

export function conversation(ws : WebSocket, req : express.Request<any, any, any, ConversationQueryParams>, next : express.NextFunction) {
    doConversation(req.user!, false, ws, req.query);
}
