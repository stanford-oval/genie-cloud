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

const user = require('../util/user');
const EngineManager = require('../almond/enginemanagerclient');
const { BadRequestError } = require('../util/errors');
const { makeRandom } = require('../util/random');

module.exports.anonymous = function(ws, req) {
    if (req.user) {
        ws.close();
        return;
    }

    user.getAnonymousUser().then((user) => {
        return doConversation(user, true, ws, req.query);
    });
};

class WebsocketApiDelegate {
    constructor(ws) {
        this._ws = ws;
    }

    send(data) {
        try {
            this._ws.send(JSON.stringify(data));
        } catch(e) {
            // ignore if the socket is closed
            if (e.message !== 'not opened')
                throw e;
        }
    }
}
WebsocketApiDelegate.prototype.$rpcMethods = ['send'];

module.exports.results = function(ws, req, next) {
    var user = req.user;

    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(user.id);
        const onclosed = (userId) => {
            if (userId === user.id)
                ws.close();
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        let delegate = new WebsocketApiDelegate(ws);
        let wrapper;
        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            try {
                await wrapper.destroy();
            } catch(e) {
                // ignore errors if engine died
            }
        });
        ws.on('ping', (data) => ws.pong(data));

        wrapper = await engine.addNotificationOutput(delegate);
    }).catch((error) => {
        console.error('Error in API websocket: ' + error.message);

        // ignore "Not Opened" error in closing
        try {
            ws.close();
        } catch(e) {/**/}
    });
};


class WebsocketAssistantDelegate {
    constructor(ws) {
        this._ws = ws;
    }

    setHypothesis() {
        // voice doesn't go through SpeechHandler, hence hypotheses don't go through here!
    }

    setExpected(what) {
        this._ws.send(JSON.stringify({ type: 'askSpecial', ask: what }));
    }

    addMessage(msg) {
         this._ws.send(JSON.stringify(msg));
    }
}
WebsocketAssistantDelegate.prototype.$rpcMethods = ['setHypothesis', 'setExpected', 'addMessage'];

async function doConversation(user, anonymous, ws, query) {
    try {
        const engine = await EngineManager.get().getEngine(user.id);
        const onclosed = (userId) => {
            if (userId === user.id)
                ws.close();
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        // "isOwner" is a multi-user assistant thing, it has nothing to do with anonymous or not
        const assistantUser = { name: user.human_name || user.username, isOwner: true };
        const options = {
            showWelcome: !query.hide_welcome,
            anonymous,

            // set a very large timeout so we don't get recycled until the socket is closed
            inactivityTimeout: 3600 * 1000
        };

        const delegate = new WebsocketAssistantDelegate(ws);

        let wrapper;
        const id = query.id || 'web-' + makeRandom(4);
        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            try {
                if (wrapper)
                    await wrapper.destroy();
            } catch(e) {
                // ignore errors if engine died
            }
            wrapper = undefined;
        });

        wrapper = await engine.getOrOpenConversation(id, assistantUser, delegate, options);
        ws.on('message', (data) => {
            Promise.resolve().then(() => {
                const parsed = JSON.parse(data);
                const platformData = {};
                switch(parsed.type) {
                case 'command':
                    return wrapper.handleCommand(parsed.text, platformData);
                case 'parsed':
                    return wrapper.handleParsedCommand(parsed.json, parsed.title, platformData);
                case 'tt':
                    return wrapper.handleThingTalk(parsed.code, platformData);
                default:
                    throw new BadRequestError('Invalid command type ' + parsed.type);
                }
            }).catch((e) => {
                console.error(e.stack);
                ws.send(JSON.stringify({ type: 'error', error: e.message, code: e.code }));
            }).catch((e) => {
                // likely, the websocket is busted
                console.error(`Failed to send error on conversation websocket: ${e.message}`);

                // ignore "Not Opened" error in closing
                try {
                    ws.close();
                } catch(e) {/**/}
            });
        });
    } catch(error) {
        console.error('Error in conversation websocket: ' + error.message);

        // ignore "Not Opened" error in closing
        try {
            ws.close();
        } catch(e) {/**/}
    }
}

module.exports.conversation = function(ws, req, next) {
    doConversation(req.user, false, ws, req.query);
};
