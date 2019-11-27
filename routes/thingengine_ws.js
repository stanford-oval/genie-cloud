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

const db = require('../util/db');
const userModel = require('../model/user');

const CloudSync = require('./cloud-sync');

var router = express.Router();


router.ws('/:cloud_id', (ws, req) => {
    db.withClient((dbClient) => {
        return userModel.getByCloudId(dbClient, req.params.cloud_id);
    }).then((rows) => {
        if (rows.length === 0) {
            ws.close();
            return;
        }

        CloudSync.handle(ws, rows[0].id);
    });
});

module.exports = router;
