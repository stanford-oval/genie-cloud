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

        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            this.$free();
        });
    }

    setRemote(remote) {
        this._remote = remote;

        this._ws.on('message', async (data) => {
            try {
                await remote.onMessage(data);
            } catch(e) {
                console.error('Failed to relay websocket message: ' + e.message);
                this._ws.close();
            }
        });
        this._ws.on('ping', async (data) => {
            try {
                await remote.onPing(data);
            } catch(e) {
                // ignore
                this._ws.close();
            }
        });
        this._ws.on('pong', async (data) => {
            try {
                await remote.onPong(data);
            } catch(e) {
                // ignore
                this._ws.close();
            }
        });
        this._ws.on('close', async (data) => {
            try {
                await remote.onClose(data);
            } catch(e) {
                // ignore
            }
            remote.$free();
        });
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
}
CloudSyncWebsocketDelegate.prototype.$rpcMethods = ['ping', 'pong', 'terminate', 'send'];

module.exports = {
    async handle(ws, userId) {
        try {
            const engine = await EngineManager.get().getEngine(userId);

            const onclosed = (id) => {
                if (id === userId)
                    ws.close();
                EngineManager.get().removeListener('socket-closed', onclosed);
            };
            EngineManager.get().on('socket-closed', onclosed);

            const delegate = new CloudSyncWebsocketDelegate(ws);
            const remote = await engine.websocket.newConnection(delegate);
            delegate.setRemote(remote);
        } catch (error) {
            console.error('Error in cloud-sync websocket: ' + error.message);

            // ignore "Not Opened" error in closing
            try {
                ws.close();
            } catch(e) {/**/}
        }
    }
};
