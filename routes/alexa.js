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
const passport = require('passport');

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

class AlexaDelegate {
    constructor(res) {
        this._buffer = '';
        this._res = res;
        this._done = false;

        this._askSpecial = null;
    }

    flush() {
        if (this._done)
            return;
        this._done = true;
        this._res.json({
           version: '1.0',
           sessionAttributes: {
           },
           response: {
               outputSpeech: {
                   type: 'PlainText',
                   text: this._buffer + (this._askSpecial === null ? '. Now what do you want me to do?' : '')
               },
               shouldEndSession: false,// this._askSpecial === null,
               directives: ([
                   {
                       type: 'Dialog.ElicitSlot',
                       slotToElicit: 'command'
                   }
               ])
           }
        });
    }

    send(text, icon) {
        this._buffer += text + '\n';
    }

    sendPicture(url, icon) {
        // FIXME
    }

    sendRDL(rdl, icon) {
        // FIXME
    }

    sendChoice(idx, what, title, text) {
        // FIXME
    }

    sendButton(title, json) {
        // FIXME
    }

    sendLink(title, url) {
        // FIXME
    }

    sendAskSpecial(what) {
        this._askSpecial = what;
    }
}
AlexaDelegate.prototype.$rpcMethods = ['send', 'sendPicture', 'sendChoice', 'sendLink', 'sendButton', 'sendAskSpecial', 'sendRDL'];

router.post('/', (req, res, next) => {
    if (req.body && req.body.session && req.body.session.user && req.body.session.user.accessToken &&
        !req.headers.authorization)
        req.headers.authorization = 'Bearer ' + req.body.session.user.accessToken;
    if (req.headers.authorization) {
        passport.authenticate('bearer', (err, user, info) => {
            // ignore auth failures and ignore sessions
            if (err) {
                next(err);
                return;
            }

            if (!user) {
                //res.status(401).json({error: 'invalid access token'});

                res.json({
                    version: '1.0',
                    sessionAttributes: {
                    },
                    response: {
                        outputSpeech: {
                            type: 'PlainText',
                            text: 'You must link your Web Almond account to use Almond with Alexa'
                        },
                        card: {
                            type: 'LinkAccount'
                        },
                        shouldEndSession: true
                    }
                });
                return;
            }
            req.login(user, next);
        })(req, res, next);
    } else {
        res.json({
            version: '1.0',
            sessionAttributes: {
            },
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: 'You must link your Web Almond account to use Almond with Alexa'
                },
                card: {
                    type: 'LinkAccount'
                },
                shouldEndSession: true
            }
        });
    }
}, (req, res) => {
    console.log('body', req.body);

    if (req.body.request.type === 'SessionEndedRequest') {
        res.json({
            version: '1.0',
            sessionAttributes: {
            },
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: "Sorry I couldn't help you with that."
                },
                shouldEndSession: true
            }
        });
        return;
    }

    if (req.body.request.type === 'LaunchRequest') {
        res.json({
            version: '1.0',
            sessionAttributes: {
            },
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: "Hi, I am Almond. Say \"alexa ask almond to start\""
                },
                shouldEndSession: false,
                /*directives: ([
                    {
                        type: 'Dialog.ElicitSlot',
                        slotToElicit: 'command'
                    }
                ])*/
            }
       });
       return;
    }

    if (req.body.request.intent.name === 'AMAZON.StopIntent') {
        res.json({
            version: '1.0',
            sessionAttributes: {
            },
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: "Thank you for using Almond, and good bye."
                },
                shouldEndSession: true
            }
        });
        return;
    }

    const user = req.user;
    const assistantUser = { name: user.human_name || user.username };
    let text = '';


    if (req.body.request.type === 'LaunchRequest')
        text = 'hello';
    else
        text = req.body.request.intent.slots.command ? req.body.request.intent.slots.command.value : '';
    if (!text) {
        res.json({
            version: '1.0',
            sessionAttributes: {
            },
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: "Hi, I am Almond. How can I help you?"
                },
                shouldEndSession: false,
                directives: ([
                    {
                        type: 'Dialog.ElicitSlot',
                        slotToElicit: 'command'
                    }
                ])
            }
       });
       return;
    }

    const delegate = new AlexaDelegate(res);

    Q.try(() => {
        return EngineManager.get().getEngine(req.user.id);
    }).then((engine) => {
        return engine.assistant.getOrOpenConversation('alexa:' + req.body.session.sessionId,
            assistantUser, delegate, { showWelcome: false, debug: true });
    }).then((conversation) => {
        return conversation.handleCommand(text);
    }).then(() => {
        return delegate.flush();
    });
});

module.exports = router;