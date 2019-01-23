// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const ThingpediaClient = require('../util/thingpedia-client');
const iv = require('../util/input_validation');

var router = express.Router();

router.get('/devices/:device', iv.validateGET({ developer_key: '?string', version: '?integer' }), (req, res, next) => {
    var device = req.params.device;
    if (!device || device.length < 5) {
        res.status(400).send('Bad Request');
        return;
    }
    var kind = device.substr(0, device.length-4);
    if (device.substr(device.length-4, 4) !== '.zip') {
        res.status(404).send('Not Found');
        return;
    }

    var client = new ThingpediaClient(req.query.developer_key);
    client.getModuleLocation(kind, req.query.version).then((location) => {
        res.cacheFor(60000);
        res.redirect(301, location);
    }, (e) => {
        res.status(400).send('Error: ' + e.message);
    }).catch(next);
});

module.exports = router;
