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

const Q = require('q');

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

    send(str) {
        try {
            this._ws.send(str);
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

    Q.try(() => {
        return EngineManager.get().getEngine(user.id);
    }).then((engine) => {
        const onclosed = (userId) => {
            if (userId === user.id)
                ws.close();
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        let delegate = new WebsocketApiDelegate(ws);
        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            try {
                await engine.assistant.removeOutput(delegate);
            } catch(e) {
                // ignore errors if engine died
            }
            delegate.$free();
        });
        ws.on('ping', (data) => ws.pong(data));

        return engine.assistant.addOutput(delegate);
    }).catch((error) => {
        console.error('Error in API websocket: ' + error.message);

        // ignore "Not Opened" error in closing
        try {
            ws.close();
        } catch(e) {/**/}
    });
};


class WebsocketAssistantDelegate {
    constructor(locale, ws) {
        this._locale = locale;
        this._ws = ws;
    }

    send(text, icon) {
        return this._ws.send(JSON.stringify({ type: 'text', text: text, icon: icon }));
    }

    sendPicture(url, icon) {
        return this._ws.send(JSON.stringify({ type: 'picture', url: url, icon: icon }));
    }

    sendRDL(rdl, icon) {
        return this._ws.send(JSON.stringify({ type: 'rdl', rdl: rdl, icon: icon }));
    }

    sendResult(message, icon) {
        return this._ws.send(JSON.stringify({
            type: 'result',
            result: message,

            fallback: message.toLocaleString(this._locale),
            icon: icon
        }));
    }

    sendChoice(idx, what, title, text) {
        return this._ws.send(JSON.stringify({ type: 'choice', idx: idx, title: title, text: text }));
    }

    sendButton(title, json) {
        return this._ws.send(JSON.stringify({ type: 'button', title: title, json: json }));
    }

    sendLink(title, url) {
        return this._ws.send(JSON.stringify({ type: 'link', title: title, url: url }));
    }

    sendAskSpecial(what) {
        return this._ws.send(JSON.stringify({ type: 'askSpecial', ask: what }));
    }
}
WebsocketAssistantDelegate.prototype.$rpcMethods = ['send', 'sendPicture', 'sendChoice', 'sendLink', 'sendButton', 'sendAskSpecial', 'sendRDL', 'sendResult'];

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
        const options = { showWelcome: !query.hide_welcome, anonymous };

        const delegate = new WebsocketAssistantDelegate(user.locale, ws);

        let opened = false, earlyClose = false;
        const id = query.id || 'web-' + makeRandom(4);
        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            try {
                if (opened)
                    await engine.assistant.closeConversation(id);
            } catch(e) {
                // ignore errors if engine died
            }
            earlyClose = true;
            opened = false;
            delegate.$free();
        });

        const conversation = await engine.assistant.openConversation(id, assistantUser, delegate, options);
        opened = true;
        ws.on('message', (data) => {
            Promise.resolve().then(() => {
                var parsed = JSON.parse(data);
                switch(parsed.type) {
                case 'command':
                    return conversation.handleCommand(parsed.text);
                case 'parsed':
                    return conversation.handleParsedCommand(parsed.json);
                case 'tt':
                    return conversation.handleThingTalk(parsed.code);
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
        if (earlyClose)
            return;
        await conversation.start();
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
