// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
    res.render('train_almond', {
        page_title: req._("Train Almond"),
        locale: req.locale
    });
});

module.exports = router;
