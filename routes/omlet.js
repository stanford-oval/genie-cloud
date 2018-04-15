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

router.get('/register', (req, res) => {
    if (req.user) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              error: req._("You are already registered for Thingpedia") });
        return;
    }

    res.render('omlet_register', { page_title: req._("Thingpedia - Complete Registration") });
});

module.exports = router;