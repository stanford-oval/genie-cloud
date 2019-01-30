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

const Q = require('q');
const express = require('express');
const crypto = require('crypto');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const user = require('../util/user');
const secret = require('../util/secret_key');
const EngineManager = require('../almond/enginemanagerclient');
const iv = require('../util/input_validation');

const Config = require('../config');

function makeRandom(bytes) {
    return crypto.randomBytes(bytes).toString('hex');
}

var router = express.Router();

const ALLOWED_ORIGINS = [Config.SERVER_ORIGIN, ...Config.EXTRA_ORIGINS, 'null'];

function isOriginOk(req) {
    if (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer '))
        return true;
    if (typeof req.headers['origin'] !== 'string')
        return true;
    return ALLOWED_ORIGINS.indexOf(req.headers['origin'].toLowerCase()) >= 0;
}

router.use((req, res, next) => {
    if (isOriginOk(req)) {
        if (req.headers['origin']) {
            res.set('Access-Control-Allow-Origin', req.headers['origin']);
            res.set('Vary', 'Origin');
        }
        res.set('Access-Control-Allow-Credentials', 'true');
        next();
    } else {
        res.status(403).send('Forbidden Cross Origin Request');
    }
});

router.ws('/anonymous', (ws, req) => {
    if (req.user) {
        ws.close();
        return;
    }

    user.getAnonymousUser().then((user) => {
        return doConversation(user, true, ws, req.query);
    });
});

router.post('/token', user.requireLogIn, (req, res, next) => {
    // issue an access token for valid for one month, with all scopes
    jwt.sign({
        sub: req.user.cloud_id,
        aud: 'oauth2',
        scope: Array.from(user.OAuthScopes)
    }, secret.getJWTSigningKey(), { expiresIn: 30*24*3600 }, (err, token) => {
        if (err)
            next(err);
        else
            res.json({ result: 'ok', token });
    });
});

router.use((req, res, next) => {
    if (user.isAuthenticated(req)) {
        next();
        return;
    }
    passport.authenticate('bearer', { session: false })(req, res, next);
});

router.options('/.*', (req, res, next) => {
    res.send('');
});

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
        res.status(400).json({error:'Missing query'});
        return;
    }

    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.assistant.parse(query, targetJson);
    }).then((result) => {
        res.json(result);
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).json({error:e.message});
    });
});

function describeApp(app) {
    return Promise.all([app.uniqueId, app.description, app.error, app.code, app.state, app.icon])
        .then(([uniqueId, description, error, code, state, icon]) => ({
            uniqueId, description, error: error, code, slots: state,
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
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).json({error:e.message});
    });
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
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).json({error:e.message});
    });
});

router.get('/apps/get/:appId', user.requireScope('user-read'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.apps.getApp(req.params.appId).then((app) => {
            if (!app) {
                res.status(404);
                return { error: 'No such app' };
            } else {
                return describeApp(app);
            }
        });
    }).then((result) => {
        res.json(result);
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).json({error:e.message});
    });
});

router.post('/apps/delete/:appId', user.requireScope('user-exec-command'), (req, res, next) => {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.apps.getApp(req.params.appId).then((app) => {
            if (!app) {
                res.status(404);
                return { error: 'No such app' };
            } else {
                return engine.apps.removeApp(app).then(() => ({status:'ok'}));
            }
        });
    }).then((result) => {
        res.json(result);
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).json({error:e.message});
    });
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
        ws.close();
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
WebsocketAssistantDelegate.prototype.$rpcMethods = ['send', 'sendPicture', 'sendChoice', 'sendLink', 'sendButton', 'sendAskSpecial', 'sendRDL'];

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
        const id = 'web-' + makeRandom(4);
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
                    throw new Error('Invalid command type ' + parsed.type);
                }
            }).catch((e) => {
                console.error(e.stack);
                ws.send(JSON.stringify({ type: 'error', error:e.message }));
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

module.exports = router;
