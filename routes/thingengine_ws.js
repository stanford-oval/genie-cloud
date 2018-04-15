// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');

const db = require('../util/db');
const userModel = require('../model/user');
const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

class WebsocketDelegate {
    constructor(ws) {
        this._ws = ws;
        this._remote = null;
    }

    setRemote(remote) {
        this._remote = remote;

        this._ws.on('message', (data) => remote.onMessage(data));
        this._ws.on('ping', () => remote.onPing());
        this._ws.on('pong', () => remote.onPong());
        this._ws.on('close', () => remote.onClose());
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
WebsocketDelegate.prototype.$rpcMethods = ['ping', 'pong', 'terminate', 'send'];

router.ws('/:cloud_id', (ws, req) => {
    db.withClient((dbClient) => {
        return userModel.getByCloudId(dbClient, req.params.cloud_id);
    }).then((rows) => {
        if (rows.length === 0)
            throw new Error('Invalid user');

        return Promise.all([rows[0].id, EngineManager.get().getEngine(rows[0].id)]);
    }).then(([id, engine]) => {
        const onclosed = (userId) => {
            if (userId === id)
                ws.close();
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        var delegate = new WebsocketDelegate(ws);
        return engine.websocket.newConnection(delegate).then((remote) => {
            delegate.setRemote(remote);
        });
    }).catch((error) => {
        console.error('Error in ThingEngine websocket: ' + error.message);
        ws.close();
    });
});

module.exports = router;