// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const express = require('express');
const passport = require('passport');

const user = require('../model/user');
const db = require('../util/db');
const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

router.post('/:user_id/:id', function(req, res, next) {
    db.withClient((dbClient) => {
       return user.getIdByCloudId(dbClient, req.params.user_id);
    }).then((user) => {
       return EngineManager.get().dispatchWebhook(user.id, req, res);
    }, (e) => {
       res.status(400).json({error:'Invalid user'});
    }).catch(next);
});

router.get('/:user_id/:id', function(req, res, next) {
    db.withClient((dbClient) => {
       return user.getIdByCloudId(dbClient, req.params.user_id);
    }).then((user) => {
       return EngineManager.get().dispatchWebhook(user.id, req, res);
    }, (e) => {
       res.status(400).json({error:'Invalid user'});
    }).catch(next);
});

module.exports = router;
