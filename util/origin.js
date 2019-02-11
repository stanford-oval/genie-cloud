// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Config = require('../config');

const ALLOWED_ORIGINS = [Config.SERVER_ORIGIN, ...Config.EXTRA_ORIGINS];

// This function checks whether cookie authentication is sufficient to consider
// the user authenticated.
// If this function returns false, we require OAuth authentication or ignore
// the user info and return public data.
//
// Cookie authentication is only in the browser, so this function only needs
// to consider browser behavior.
// If non-browser agents get hold of the cookies, all bets are off cause they
// can just fake the Origin header.
//
// Origin checks are necessary to prevent a form of Cross-Site Request Forgery,
// where a malicious third-party website issues cookie-authenticated cross-origin
// requests
function isOriginOk(req) {
    // a request without Origin header is considered OK
    //
    // browsers omit the Origin header for same-origin GET requests
    // the important part though is that they include it for cross-origin requests,
    // as well as unsafe requests (POST, WebSocket)
    if (req.headers['origin'] === undefined)
        return true;
    if (typeof req.headers['origin'] !== 'string')
        return false;
    return ALLOWED_ORIGINS.indexOf(req.headers['origin'].toLowerCase()) >= 0;
}

module.exports = { isOriginOk };
