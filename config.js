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

// Where to store icons and zip files
// Set to s3 to use Amazon S3, local to use the local filesystem
// (which must be configured with the correct permissions)
module.exports.FILE_STORAGE_BACKEND = 'local';

// The location where icons and zip files are stored
// If using the S3 storage backend, this could be the S3 website URL, or the URL
// of a CloudFront distribution mapping to the S3 bucket.
// If using the `local` storage backend, it must be the exact string "/download"
module.exports.CDN_HOST = '/download';

// The CDN to use for website assets (javascript, css, images files contained in public/ )
// If you are using CloudFront+S3, you can use `./scripts/sync-assets-to-s3.sh ${s3_bucket}`
// to upload the assets. If you are using CloudFront+ELB, you can simply point the
// CDN to the almond-cloud website; the website will act as origin server for the content
// and set appropriate cache headers.
// Use a fully qualified URL (including https://) and omit the trailing slash.
// Leave blank if you do not want to use a CDN, in which case assets will
// be loaded directly from the almond-cloud website.
module.exports.ASSET_CDN = '';

// Address of each master process
// Each address must be specified in sockaddr form:
// - absolute or relative path for Unix socket
// - hostname:port for TCP
//
// Multiple addresses can be provided, in which case the users will be sharded across
// multiple masters based on their ID (using a simple hashing scheme)
//
// The number of shards can be changed dynamically, provided all processes use
// a consistent configuration (they must be all stopped when the configuration is changed),
// and all shards have access to shared storage (eg NFS)
// If the storage is not shared, use scripts/shard-users.js to compute which user is
// assigned to which shard, and transfer the user's folder appropriately
module.exports.THINGENGINE_MANAGER_ADDRESS = ['./control'];
module.exports.THINGENGINE_MANAGER_AUTHENTICATION = null;
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

// enable Strict-Transport-Security, Content-Security-Policy and other
// security related headers
// requires TLS
module.exports.ENABLE_SECURITY_HEADERS = false;

// override which pug file to use for about pages
// use this to customize the index, terms-of-service, etc. pages
// the key should be the page name (part of path after /about)
// the value should be the name of a pug file in views, without the .pug
// extension
// if unspecified, defaults to "about_" + page_name, eg. for research
// it defaults to showing about_research.pug
//
// use ABOUT_OVERRIDE['index'] to override the whole website index
// note that "/about" with no page unconditionally redirects to "/"
module.exports.ABOUT_OVERRIDE = {};

// adds new pages to the /about hierarchy
// the format should be:
// {
//   url: path name, excluding /about part
//   title: page title
//   view: name of pug file
//   navbar: link label in navbar, or null to exclude from the navbar
// }
module.exports.EXTRA_ABOUT_PAGES = [];

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

// the URL of a luinet-compatible Natural Language parsing server
module.exports.NL_SERVER_URL = 'https://almond-nl.stanford.edu';
// access token for administrative operations in luinet
module.exports.NL_SERVER_ADMIN_TOKEN = null;

// set to true to let users try out Almond without logging in
// they will operate as the user "anonymous"
module.exports.ENABLE_ANONYMOUS_USER = false;

// the following should be set in secret_config.js (which is not checked
// into git) or not set at all

// URL and access token for a server that supports autotraining when
// devices are updated in Thingpedia
module.exports.TRAINING_URL = null;
module.exports.TRAINING_ACCESS_TOKEN = null;

// Configuration file for training (to override the defaults in training/training_job.js)
module.exports.TRAINING_CONFIG_FILE = null;

// Path to the genie-parser package (to be used by the auto training daemon)
module.exports.GENIE_PARSER_PATH = '/opt/genie-parser';

// OAuth Client secret to support Login With Google
module.exports.GOOGLE_CLIENT_SECRET = null;

// OAuth Client secret to support Login With Github
module.exports.GITHUB_CLIENT_SECRET = null;

// OAuth Client ID to support Login With Github
module.exports.GITHUB_CLIENT_ID = '';

// Mailgun user/password for emails sent from Almond
module.exports.MAILGUN_USER = null;
module.exports.MAILGUN_PASSWORD = null;

// From: field of user emails (email verification, password reset, etc.)
module.exports.EMAIL_FROM_USER = 'Almond <noreply@almond.stanford.edu>';
// From: field of admin emails (review requests, developer requests, etc.)
module.exports.EMAIL_FROM_ADMIN = 'Almond <root@almond.stanford.edu>';
// From: field of admin-training notifications
module.exports.EMAIL_FROM_TRAINING = 'Almond Training Service <almond-training@almond.stanford.edu>';
// To: field of admin emails
module.exports.EMAIL_TO_ADMIN = 'thingpedia-admins@lists.stanford.edu';

// The device to use as the primary "messaging" device (for communicating
// assistants
module.exports.MESSAGING_DEVICE = 'org.thingpedia.builtin.matrix';

// Enable metric collection using Prometheus
module.exports.ENABLE_PROMETHEUS = false;
// Access token to use for /metrics endpoint
// If null, the endpoint will have no authentication
// This value should match the "bearer_token" prometheus configuration value
module.exports.PROMETHEUS_ACCESS_TOKEN = null;

// Single-Sign-On for discourse
// See https://meta.discourse.org/t/official-single-sign-on-for-discourse-sso/13045
// for the protocol
//
// SSO will be disabled (404 error) if SSO_SECRET or SSO_REDIRECT is null
//
// Unlike OAuth, there is no "confirm" step before user's data is sent to the
// requesting service, hence this secret REALLY must be secret
module.exports.DISCOURSE_SSO_SECRET = null;
// this should be the origin only, /session/sso_login will be appended
module.exports.DISCOURSE_SSO_REDIRECT = null;

// What natural languages are enabled, as locale tags
//
// Defaults to American English only
//
// Note that this must contain at least one language, or the server will fail
// to operate.
module.exports.SUPPORTED_LANGUAGES = ['en-US'];

// load more configuration that should not go in git (eg secret keys)
try {
    Object.assign(module.exports, require('./secret_config.js'));
} catch(e) {
    // ignore if there is no file
}
