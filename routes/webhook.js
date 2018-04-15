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

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

router.post('/:user_id/:id', (req, res) => {
    EngineManager.get().dispatchWebhook(req, res);
});

router.get('/:user_id/:id', (req, res) => {
    EngineManager.get().dispatchWebhook(req, res);
});

module.exports = router;