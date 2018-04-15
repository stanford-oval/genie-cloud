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

router.get('/qrcode-cloud/:cloud_id/:auth_token', (req, res, next) => {
    res.render('qrcode', { for_: 'cloud',
                           link: req.originalUrl,
                           authToken: req.params.auth_token,
                           cloudId: req.params.cloud_id });
});

module.exports = router;
