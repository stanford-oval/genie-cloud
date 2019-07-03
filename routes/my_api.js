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
const express = require('express');
const crypto = require('crypto');
const passport = require('passport');

const user = require('../util/user');
const EngineManager = require('../almond/enginemanagerclient');
const iv = require('../util/input_validation');
const { isOriginOk } = require('../util/origin');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../util/errors');
const errorHandling = require('../util/error_handling');

const Config = require('../config');

function makeRandom(bytes) {
    return crypto.randomBytes(bytes).toString('hex');
}

var router = express.Router();

router.ws('/anonymous', (ws, req) => {
    if (req.user) {
        ws.close();
        return;
    }

    user.getAnonymousUser().then((user) => {
        return doConversation(user, true, ws, req.query);
    });
});

router.options('/[^]{0,}', (req, res, next) => {
    res.set('Access-Control-Max-Age', '86400');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Authorization, Accept, Content-Type');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Vary', 'Origin');
    res.send('');
});

router.use((req, res, next) => {
    if (isOriginOk(req) && user.isAuthenticated(req))
        next();
    else if (typeof req.query.access_token === 'string' || (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer ')))
        passport.authenticate('bearer', { session: false })(req, res, next);
    else
        next(new ForbiddenError('Forbidden Cross Origin Request'));
});

router.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Vary', 'Origin');
    next();
});

router.use(user.requireLogIn);

router.get('/profile', user.requireScope('profile'), (req, res, next) => {
    res.json({
        id: req.user.cloud_id,
        username: req.user.username,
        full_name: req.user.human_name,
        email: req.user.email,
        email_verified: req.user.email_verified,
        locale: req.user.locale,
        timezone: req.user.timezone,
        model_tag: req.user.model_tag
    });
});

router.get('/parse', user.requireScope('user-read'), iv.validateGET({ q: '?string', target_json: '?string' }, { json: true }), (req, res, next) => {
    let query = req.query.q || null;
    let targetJson = req.query.target_json || null;
    if (!query && !targetJson) {
        next(new BadRequestError('Missing query'));
        return;
    }

    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.assistant.parse(query, targetJson);
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

async function describeDevice(d, req) {
    const [uniqueId, name, description, kind, ownerTier] = await Promise.all([
        d.uniqueId, d.name, d.description, d.kind, d.ownerTier]);

    return {
        uniqueId: uniqueId,
        name: name || req._("Unknown device"),
        description: description || req._("Description not available"),
        kind: kind,
        ownerTier: ownerTier
    };
}

router.get('/devices/list', user.requireScope('user-read'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.devices.getAllDevices().then((devices) => {
            return Promise.all(devices.map((d) => describeDevice(d, req)));
        });
    }).then((result) => {
        // sort by name to provide a deterministic result
        result.sort((a, b) => a.name.localeCompare(b.name));
        res.json(result);
    }).catch(next);
});

function describeApp(app) {
    return Promise.all([app.uniqueId, app.description, app.error, app.code, app.icon])
        .then(([uniqueId, description, error, code, icon]) => ({
            uniqueId, description, error: error, code,
            icon: icon ? Config.CDN_HOST + '/icons/' + icon + '.png' : null
        }));
}

router.post('/apps/create', user.requireScope('user-exec-command'),
    iv.validatePOST({ code: 'string' }, { accept: 'json', json: true }), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.assistant.createApp(req.body);
    }).then((result) => {
        if (result.error)
            res.status(400);
        res.json(result);
    }).catch(next);
});

router.get('/apps/list', user.requireScope('user-read'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.apps.getAllApps().then((apps) => {
            return Promise.all(apps.map((a) => describeApp(a)));
        });
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

router.get('/apps/get/:appId', user.requireScope('user-read'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.apps.getApp(req.params.appId).then((app) => {
            if (!app)
                throw new NotFoundError();
            return describeApp(app);
        });
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

router.post('/apps/delete/:appId', user.requireScope('user-exec-command'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.apps.getApp(req.params.appId).then((app) => {
            if (!app)
                throw new NotFoundError();
            return engine.apps.removeApp(app).then(() => ({status:'ok'}));
        });
    }).then((result) => {
        res.json(result);
    }).catch(next);
});

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

router.ws('/results', user.requireScope('user-read-results'), (ws, req, next) => {
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
});

class WebsocketAssistantDelegate {
    constructor(ws) {
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

            // FIXME pass the right locale here...
            fallback: message.toLocaleString(),
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

        const delegate = new WebsocketAssistantDelegate(ws);

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

router.ws('/conversation', user.requireScope('user-exec-command'), (ws, req, next) => {
    doConversation(req.user, false, ws, req.query);
});

class WebsocketDelegate {
    constructor(ws) {
        this._ws = ws;
        this._remote = null;
    }

    setRemote(remote) {
        this._remote = remote;

        this._ws.on('message', (data) => {
            try {
                remote.onMessage(data);
            } catch(e) {
                console.error('Failed to relay websocket message: ' + e.message);
                this._ws.close();
            }
        });
        this._ws.on('ping', (data) => {
            try {
                remote.onPing(data);
            } catch(e) {
                // ignore
                this._ws.close();
            }
        });
        this._ws.on('pong', (data) => {
            try {
                remote.onPong(data);
            } catch(e) {
                // ignore
                this._ws.close();
            }
        });
        this._ws.on('close', (data) => {
            try {
                remote.onClose(data);
            } catch(e) {
                // ignore
            }
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
WebsocketDelegate.prototype.$rpcMethods = ['ping', 'pong', 'terminate', 'send'];

router.ws('/sync', user.requireScope('user-sync'), async (ws, req) => {
    try {
        const userId = req.user.id;
        const engine = await EngineManager.get().getEngine(userId);

        const onclosed = (id) => {
            if (id === userId)
                ws.close();
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        const delegate = new WebsocketDelegate(ws);
        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', async () => {
            delegate.$free();
        });

        const remote = await engine.websocket.newConnection(delegate);
        delegate.setRemote(remote);
    } catch (error) {
        console.error('Error in cloud-sync websocket: ' + error.message);

        // ignore "Not Opened" error in closing
        try {
            ws.close();
        } catch(e) {/**/}
    }
});

// if nothing handled the route, return a 404
router.use('/', (req, res) => {
    res.status(404).json({ error: 'Invalid endpoint' });
});

// if something failed, return a 500 in json form, or the appropriate status code
router.use(errorHandling.json);

module.exports = router;
