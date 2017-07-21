// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const crypto = require('crypto');
const passport = require('passport');

const Config = require('../config');

const db = require('../util/db');
const user = require('../util/user');
const userModel = require('../model/user');
const EngineManager = require('../almond/enginemanagerclient');

const ThingTalk = require('thingtalk');
const AppGrammar = ThingTalk.Grammar;

function makeRandom(bytes) {
    return crypto.randomBytes(bytes).toString('hex');
}

var router = express.Router();

const ALLOWED_ORIGINS = ['http://127.0.0.1:8080',
    'https://thingpedia.stanford.edu', 'https://thingengine.stanford.edu',
    'https://almond.stanford.edu'];

function isOriginOk(req) {
    if (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer'))
        return true;
    if (!req.headers['origin'])
        return true;
    if (req.headers['origin'].startsWith('http://127.0.0.1'))
        return true;
    return ALLOWED_ORIGINS.indexOf(req.headers['origin'].toLowerCase()) >= 0;
}

function checkOrigin(req, res, next) {
    if (isOriginOk(req))
        next();
    else
        res.status(403).send('Forbidden Cross Origin Request');
}

router.use('/', function(req, res, next) {
    passport.authenticate('bearer', function(err, user, info) {
        // ignore auth failures and ignore sessions
        if (err) { return next(err); }
        if (!user) { return next(); }
        req.login(user, next);
    })(req, res, next);
}, checkOrigin, user.requireLogIn);

router.get('/parse', function(req, res, next) {
    var query = req.query.q;
    if (!query) {
        res.status(400).json({error:'Missing query'});
        return;
    }

    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then(function(engine) {
        return engine.assistant.parse(query);
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
            icon: icon ? Config.S3_CLOUDFRONT_HOST + '/icons/' + icon + '.png' : null
        }));
}

router.post('/apps/create', function(req, res, next) {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then(function(engine) {
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

router.get('/apps/list', function(req, res, next) {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then(function(engine) {
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

router.get('/apps/get/:appId', function(req, res, next) {
    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then(function(engine) {
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

router.post('/apps/delete/:appId', function(req, res, next) {
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
            return this._ws.send(str);
        } catch(e) {
            // ignore if the socket is closed
            if (e.message !== 'not opened')
                throw e;
        }
    }
}
WebsocketApiDelegate.prototype.$rpcMethods = ['send'];

router.ws('/results', function(ws, req, next) {
    var user = req.user;

    Q.try(() => {
        return EngineManager.get().getEngine(user.id);
    }).then(function(engine) {
        const onclosed = (userId) => {
            if (userId === user.id) {
                ws.close();
            }
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        let delegate = new WebsocketApiDelegate(ws);
        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', () => {
            engine.assistant.removeOutput(delegate); // ignore errors if engine died
            delegate.$free();
        });

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

router.ws('/conversation', function(ws, req, next) {
    var user = req.user;

    Q.try(() => {
        return EngineManager.get().getEngine(user.id);
    }).then(function(engine) {
        const onclosed = (userId) => {
            if (userId === user.id) {
                ws.close();
            }
            EngineManager.get().removeListener('socket-closed', onclosed);
        };
        EngineManager.get().on('socket-closed', onclosed);

        var assistantUser = { name: user.human_name || user.username };
        var delegate = new WebsocketAssistantDelegate(ws);

        var opened = false;
        const id = 'web-' + makeRandom(16);
        ws.on('error', (err) => {
            ws.close();
        });
        ws.on('close', () => {
            if (opened)
                engine.assistant.closeConversation(id); // ignore errors if engine died
            delegate.$free();
            opened = false;
        });

        return engine.assistant.openConversation(id, assistantUser, delegate, { showWelcome: true })
            .tap((conversation) => {
                opened = true;
                return conversation.start();
            }).then((conversation) => {
                ws.on('message', (data) => {
                    Q.try(() => {
                        var parsed = JSON.parse(data);
                        switch(parsed.type) {
                        case 'command':
                            return conversation.handleCommand(parsed.text);
                            break;
                        case 'parsed':
                            return conversation.handleParsedCommand(parsed.json);
                            break;
                        }
                    }).catch((e) => {
                        console.error(e.stack);
                        ws.send(JSON.stringify({ type: 'error', error:e.message }));
                    });
                });
            });
    }).catch((error) => {
        console.error('Error in conversation websocket: ' + error.message);
        ws.close();
    });
});

module.exports = router;
