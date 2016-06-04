// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');

var router = express.Router();

router.get('/qrcode/:server/:port/:auth_token', function(req, res, next) {
    res.render('qrcode', { for_: 'server',
                           link: req.originalUrl,
                           authToken: req.params.auth_token });
});

router.get('/qrcode-cloud/:cloud_id/:auth_token', function(req, res, next) {
    res.render('qrcode', { for_: 'cloud',
                           link: req.originalUrl,
                           authToken: req.params.auth_token,
                           cloudId: req.params.cloud_id });
});

module.exports = router;
