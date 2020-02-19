// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const EngineManager = require('../almond/enginemanagerclient');

class CloudSyncWebsocketDelegate {
    constructor(ws) {
        this._ws = ws;
        this._remote = null;
        this._buffer = [];

        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            this.$free();
        });
        ws.on('message', async (data) => {
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

    async setRemote(remote) {
        this._remote = remote;
        this._ws.on('close', async (data) => {
            try {
                await remote.onClose(data);
            } catch(e) {
                // ignore
            }
            remote.$free();
        });
        for (let data of this._buffer)
            await remote.onMessage(data);
    }

    ping() {
        this._ws.ping();
    }

    pong() {
        this._ws.pong();
    }

    send(data) {
        this._ws.send(data);
    }

    terminate() {
        this._ws.terminate();
    }

    async setUser(userId) {
        try {
            const engine = await EngineManager.get().getEngine(userId);

            const onclosed = (id) => {
                if (id === userId)
                    this._ws.close();
                EngineManager.get().removeListener('socket-closed', onclosed);
            };
            EngineManager.get().on('socket-closed', onclosed);

            const remote = await engine.websocket.newConnection(this);
            await this.setRemote(remote);
        } catch (error) {
            console.error('Error in cloud-sync websocket: ' + error.message);

            // ignore "Not Opened" error in closing
            try {
                this._ws.close();
            } catch(e) {/**/}
        }
    }
}
CloudSyncWebsocketDelegate.prototype.$rpcMethods = ['ping', 'pong', 'terminate', 'send'];

module.exports = {
    handle(ws) {
        return new CloudSyncWebsocketDelegate(ws);
    }
};
