// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// The location where icons and zip files are stored
// This can be an absolute URI ending in cloudfront.net, which enables the
// S3 storage backend, or the exact string "/download", which enables the
// local storage backend
module.exports.S3_CLOUDFRONT_HOST = '/download';
module.exports.THINGENGINE_MANAGER_ADDRESS = './control';
module.exports.THINGENGINE_DIRECT_ADDRESS = './direct';
module.exports.BING_KEY = '';

// set this to 'embedded' to enable the embedded Thingpedia,
// to 'external' to use the Thingpedia at THINGPEDIA_URL;
module.exports.WITH_THINGPEDIA = 'external';
// this is used to construct links to Thingpedia, eg from My Almond
// it MUST be set to '/thingpedia' to use the embedded Thingpedia
module.exports.THINGPEDIA_URL = 'https://thingpedia.stanford.edu/thingpedia';

// the origin (scheme, hostname, port) where the server is reachable
// this is used for redirects, and to enable special behavior for the main
// Almond website
module.exports.SERVER_ORIGIN = 'http://127.0.0.1:8080';

// enable redirection to SERVER_ORIGIN for requests with different hostname
// or scheme
module.exports.ENABLE_REDIRECT = true;

// additional origins that should be allowed to make Cookie-authenticated
// API requests
module.exports.EXTRA_ORIGINS = [];

// the base URL used for OAuth redirects
//
// this is used by Login With Google
// the full OAuth redirect URI for Google is
// OAUTH_REDIRECT_ORIGIN + /user/oauth2/google/callback
//
// it is also used by the OAuth configuration mechanism for accounts/devices
// in Web Almond
// by default, it is the same as SERVER_ORIGIN, but you can change it
// if you put a different value in the developer console / redirect URI
// fields of the various services
module.exports.OAUTH_REDIRECT_ORIGIN = module.exports.SERVER_ORIGIN;

// the URL of a almond-nnparser-compatible Natural Language parsing server
module.exports.NL_SERVER_URL = 'https://almond-nl.stanford.edu';

// set to true to let users try out Almond without logging in
// they will operate as the user "anonymous"
module.exports.ENABLE_ANONYMOUS_USER = false;

// the following should be set in secret_config.js (which is not checked
// into git) or not set at all

// URL and access token for a server that supports autotraining when
// devices are updated in Thingpedia
module.exports.TRAINING_URL = null;
module.exports.TRAINING_ACCESS_TOKEN = null;

// OAuth Client secret to support Login With Google
module.exports.GOOGLE_CLIENT_SECRET = null;

// Mailgun user/password to handle the "Request Developer Access" form
module.exports.MAILGUN_USER = null;
module.exports.MAILGUN_PASSWORD = null;

// The device to use as the primary "messaging" device (for communicating
// assistants
module.exports.MESSAGING_DEVICE = 'org.thingpedia.builtin.matrix';

// load more configuration that should not go in git (eg secret keys)
try {
    Object.assign(module.exports, require('./secret_config.js'));
} catch(e) {}