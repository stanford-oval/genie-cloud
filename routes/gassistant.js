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
const {WebhookClient} = require('dialogflow-fulfilment');

var router = express.Router();

router.post('/', (req, res, next) => {
    const agent = new WebhookClient({ req, res });
    const raw = req.body.queryResult.queryText;

    function welcome(agent) {
        agent.add(`welcome!`);
    }

    function fallback(agent) {
        agent.add(`fallback: ${raw}`);
    }

    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    agent.handleRequest(intentMap);
});

module.exports = router;
