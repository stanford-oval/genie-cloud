// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');

const user = require('../util/user');
const { ForbiddenError } = require('../util/errors');
const { isOriginOk } = require('../util/origin');
const MyConversation = require('./my_conversation');

var router = express.Router();

// /me/ws is not under Access-Control-Allow-Origin, but we need to check
// this manually because WebSockets are not subject to same-origin policy
// so the browser won't protect us
router.use((req, res, next) => {
    if (isOriginOk(req))
        next();
    else
        next(new ForbiddenError('Forbidden Cross Origin Request'));
});
router.ws('/anonymous', MyConversation.anonymous);
router.use(user.requireLogIn);
router.ws('/results', MyConversation.results);
router.ws('/conversation', MyConversation.conversation);

module.exports = router;
