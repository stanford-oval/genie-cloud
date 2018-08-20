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
const router = express.Router();
const EngineManager = require('../almond/enginemanagerclient');

router.get('/', (req, res, next) => {
    return Promise.resolve().then(() => {
        return req.user ? EngineManager.get().isRunning(req.user.id) : false;
    }).then((isRunning) => {
        res.render('almond', {
            page_title: req._("Almond - The Open Virtual Assistant"),
            isRunning: isRunning,
            csrfToken: req.csrfToken()
        });
    });
});



module.exports = router;
