// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
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
