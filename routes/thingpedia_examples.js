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

const user = require('../util/user');
const model = require('../model/example');
const db = require('../util/db');

var router = express.Router();

router.post('/upvote/:id', user.requireLogIn, (req, res, next) => {
    db.withClient((dbClient) => {
        return model.like(dbClient, req.user.id, req.params.id);
    }).then((liked) => {
        res.json({ result: (liked ? 'ok' : 'no_change') });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).catch(next);
});

router.post('/downvote/:id', user.requireLogIn, (req, res, next) => {
    db.withClient((dbClient) => {
        return model.unlike(dbClient, req.user.id, req.params.id);
    }).then((unliked) => {
        res.json({ result: (unliked ? 'ok' : 'no_change') });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).catch(next);
});

router.post('/hide/:id', user.requireLogIn, user.requireRole(user.Role.THINGPEDIA_ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return model.hide(dbClient, req.params.id);
    }).then(() => {
        res.json({ result: 'ok' });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).catch(next);
});

router.post('/delete/:id', user.requireLogIn, user.requireRole(user.Role.THINGPEDIA_ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return model.deleteById(dbClient, req.params.id);
    }).then(() => {
        res.json({ result: 'ok' });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).catch(next);
});

module.exports = router;
