// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const passport = require('passport');

const errorHandling = require('../../../util/error_handling');
const userUtils = require('../../../util/user');
const userModel = require('../../../model/user');
const alexaModelsModel = require('../../../model/alexa_model');
const I18n = require('../../../util/i18n');
const db = require('../../../util/db');

const EngineManager = require('../../../almond/enginemanagerclient');

const { requestToThingTalk } = require('./intent_parser');

var router = express.Router();

class AlexaDelegate {
    constructor(locale, res) {
        this._locale = locale;
        this._buffer = '';
        this._res = res;
        this._done = false;
        this._card = undefined;

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
                   text: this._buffer // + (this._askSpecial === null ? '. Now what do you want me to do?' : '')
               },
               card: this._card,
               shouldEndSession: this._askSpecial === null,
           }
        });
    }

    setHypothesis() {}

    setExpected(what) {
        this._askSpecial = what;
    }

    addMessage(msg) {
        switch (msg.type) {
        case 'text':
        case 'result':
            this._buffer += msg.text + '\n';
            break;

        case 'rdl':
            this._buffer += msg.rdl.displayTitle + '\n';
            break;

        case 'choice':
            this._buffer += msg.title + '\n';
            break;

        case 'link':
            if (msg.url === '/user/register') {
                this._card = {
                    type: 'LinkAccount'
                };
            }
            // FIXME handle other URL types
            break;

        case 'picture':
        case 'button':
            // FIXME
            break;
        }
    }
}
AlexaDelegate.prototype.$rpcMethods = ['setExpected', 'setHypothesis', 'addMessage'];

function authenticate(req, res, next) {
    if (req.body && req.body.session && req.body.session.user && req.body.session.user.accessToken &&
        !req.headers.authorization)
        req.headers.authorization = 'Bearer ' + req.body.session.user.accessToken;
    if (req.headers.authorization)
        passport.authenticate('bearer', { session: false })(req, res, next);
    else
        next();
}

router.use(authenticate);
router.use(userUtils.requireScope('user-exec-command'));

async function handle(modelTag, req, res) {
    console.log('body', req.body);

    const language = I18n.localeToLanguage(req.body.locale);
    const [user, anonymous, input] = await db.withTransaction(async (dbClient) => {
        let alexaModel = null;
        if (modelTag !== null)
            alexaModel = await alexaModelsModel.getByTag(dbClient, language, modelTag);

        let user, anonymous;
        if (userUtils.isAuthenticated(req)) {
            user = req.user;
            anonymous = false;
        } else if (alexaModel !== null) {
            user = await userModel.get(dbClient, alexaModel.anonymous_user);
            anonymous = true;
        } else {
            user = await userUtils.getAnonymousUser();
            anonymous = true;
        }

        const input = await requestToThingTalk(dbClient, user.locale, req.body);

        console.log(user.username, anonymous);
        return [user, anonymous, input];
    });

    const delegate = new AlexaDelegate(user.locale, res);

     // "isOwner" is a multi-user assistant thing, it has nothing to do with anonymous or not
    const assistantUser = { name: user.human_name || user.username, isOwner: true };
    const engine = await EngineManager.get().getEngine(user.id);
    const conversation = await engine.getOrOpenConversation('alexa:' + req.body.session.sessionId,
        assistantUser, delegate, { anonymous, showWelcome: false, debug: true });

    if (input.program)
        await conversation.handleThingTalk(input.program);
    else if (input.text)
        await conversation.handleCommand(input.text);
    else
        await conversation.handleParsedCommand(input);
    await delegate.flush();
}

router.post('/', (req, res, next) => {
    handle(null, req, res).catch(next);
});

router.post('/@:model_tag', (req, res, next) => {
    handle(req.params.model_tag, req, res).catch(next);
});

router.use((req, res) => {
    // if we get here, we have a 404 response
    res.status(404).json({ error: "Invalid endpoint", code: 'ENOENT' });
});
router.use(errorHandling.json);

module.exports = router;
