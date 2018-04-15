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

router.get('/', (req, res, next) => {
    res.render('train_almond', {
        page_title: req._("Train Almond"),
        locale: req.locale
    });
});

module.exports = router;