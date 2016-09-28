// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const jade = require('jade');
const crypto = require('crypto');

const user = require('../util/user');
const model = require('../model/example');
const db = require('../util/db');

var router = express.Router();

router.post('/upvote/:id', user.requireLogIn, function(req, res) {
    db.withClient((dbClient) => {
        return model.upvote(dbClient, req.params.id);
    }).then(() => {
        res.json({ result: 'ok' });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).done();
});

router.post('/downvote/:id', user.requireLogIn, function(req, res) {
    db.withClient((dbClient) => {
        return model.downvote(dbClient, req.params.id);
    }).then(() => {
        res.json({ result: 'ok' });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).done();
});

router.post('/hide/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    db.withClient((dbClient) => {
        return model.hide(dbClient, req.params.id);
    }).then(() => {
        res.json({ result: 'ok' });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).done();
});

router.post('/delete/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    db.withClient((dbClient) => {
        return model.deleteById(dbClient, req.params.id);
    }).then(() => {
        res.json({ result: 'ok' });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).done();
});

module.exports = router;
