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

/**
  Database URL.

  This must be the URL of the MySQL server shared by all almond-cloud components.

  The format is:
  ```
  mysql://<user>:<password>@<hostname>/<db_name>?<options>
  ```
  See the documentation of node-mysql for options.
  If you use Amazon RDS, you should say so with `ssl=Amazon%20RDS`.
  It is recommended you set `timezone=Z` in the options (telling the database to store dates and times in UTC timezone).

  For legacy reasons, this defaults to the `DATABASE_URL` environment variable.
  Using environment variables is currently secure but deprecated (because it can lead to security bugs).

  Note: do not set this in `custom_config.js`, only in `/etc/almond-cloud/config.js`.
*/
module.exports.DATABASE_URL = process.env.DATABASE_URL;

/**
  Secret key for cookie signing.

  This can be an arbitrary secret string. It is recommended to choose 64 random HEX characters (256 bit security).
  Choose a secure secret to prevent session hijacking.

  For legacy reasons, this defaults to the `SECRET_KEY` environment variable.
  Using environment variables is currently secure but deprecated (because it can lead to security bugs).
  The server will refuse to start if this option is not set.
*/
module.exports.SECRET_KEY = process.env.SECRET_KEY;

/**
  Secret key for JsonWebToken signing (OAuth 2.0 tokens)

  This can be an arbitrary secret string. It is recommended to choose 64 random HEX characters (256 bit security).
  Choose a secure secret to prevent forging OAuth access tokens.

  For legacy reasons, this defaults to the `JWT_SIGNING_KEY` environment variable.
  Using environment variables is currently secure but deprecated (because it can lead to security bugs).
  The server will refuse to start if this option is not set.
*/
module.exports.JWT_SIGNING_KEY = process.env.JWT_SIGNING_KEY;

/**
  Symmetric encryption key for user authentication material

  This key is used whenever user-authentication-related secret material must be encrypted symmetrically,
  rather than simply hashed. In particular, it is used to encrypt and decrypt per-user 2-factor keys.

  This secret must be exactly 32 hex characters (128 bits).

  For legacy reasons, this defaults to the `AES_SECRET_KEY` environment variable.
  Using environment variables is currently secure but deprecated (because it can lead to security bugs).
  The server will refuse to start if this option is not set.
*/
module.exports.AES_SECRET_KEY = process.env.AES_SECRET_KEY;


/**
  Address of each master process.

  Each address must be specified in sockaddr form:
  - absolute or relative path for Unix socket
  - hostname:port for TCP

  Multiple addresses can be provided, in which case the users will be sharded across
  multiple masters based on their ID (using a simple hashing scheme).

  The number of shards can be changed dynamically, provided all processes use
  a consistent configuration (they must be all stopped when the configuration is changed),
  and all shards have access to shared storage (eg NFS).
  If the storage is not shared, use scripts/shard-users.js to compute which user is
  assigned to which shard, and transfer the user's folder appropriately.
*/
module.exports.THINGENGINE_MANAGER_ADDRESS = ['./control'];
/**
  Access token to communicate with the master process.

  This **must** be set if communication happens over to TCP, but can be left to
  the default `null` value if communication happens over Unix domain sockets, in which
  case file system permissions are used to restrict access.
*/
module.exports.THINGENGINE_MANAGER_AUTHENTICATION = null;

/**
  Thingpedia configuration.

  Set this option to 'embedded' to enable the embedded Thingpedia,
  to 'external' to use the Thingpedia at THINGPEDIA_URL.
*/
module.exports.WITH_THINGPEDIA = 'external';
/**
  Thingpedia URL

  This is used by the Almond backend to communicate with the external Thingpedia,
  and it is also used to construct links to Thingpedia from My Almond.
  It **must** be set to `'/thingpedia'` to use the embedded Thingpedia.
*/
module.exports.THINGPEDIA_URL = 'https://thingpedia.stanford.edu/thingpedia';

/**
  Where to store icons and zip files.

  Set this option to s3 to use Amazon S3, local to use the local filesystem
 (which must be configured with the correct permissions).
*/
module.exports.FILE_STORAGE_BACKEND = 'local';

/**
  The location where icons and zip files are stored.

  If using the S3 storage backend, this could be the S3 website URL, or the URL
  of a CloudFront distribution mapping to the S3 bucket.
  If using the `local` storage backend, it must be the exact string `"/download"`.
*/
module.exports.CDN_HOST = '/download';

/**
  The CDN to use for website assets (javascript, css, images files contained in public/ )

  If you are using CloudFront+S3, you can use `./scripts/sync-assets-to-s3.sh ${s3_bucket}`
  to upload the assets. If you are using CloudFront+ELB, you can simply point the
  CDN to the almond-cloud website; the website will act as origin server for the content
  and set appropriate cache headers.

  Use a fully qualified URL (including https://) and omit the trailing slash.
  Leave blank if you do not want to use a CDN, in which case assets will
  be loaded directly from the almond-cloud website.
*/
module.exports.ASSET_CDN = '';

/**
  The origin (scheme, hostname, port) where the server is reachable.

  This is used for redirects and CORS checks.
*/
module.exports.SERVER_ORIGIN = 'http://127.0.0.1:8080';

/**
  Enable redirection to SERVER_ORIGIN for requests with different hostname
  or scheme.

  Use this to enable transparent HTTP to HTTPS redirection.
*/
module.exports.ENABLE_REDIRECT = true;

/**
  Enable HTTPs security headers.

  Enable Strict-Transport-Security, Content-Security-Policy and other
  headers. This option has no effect if the server is not available over TLS.
*/
module.exports.ENABLE_SECURITY_HEADERS = false;

/**
  Override which pug file to use for about pages.

  Use this option to customize the index, terms-of-service, etc. pages
  The key should be the page name (part of path after /about),
  the value should be the name of a pug file in views, without the .pug
  extension.

  If unspecified, defaults to "about_" + page_name, eg. for `privacy`
  it defaults to showing `about_privacy.pug`.

  If you plan to serve Web Almond to users and allow registration,
  at the minimum you must override the `tos` page (terms of service) and the
  `privacy` page (privacy policy), as they are empty in the default installation.

  Use ABOUT_OVERRIDE['index'] to override the whole website index.
  Note that "/about" with no page unconditionally redirects to "/",
*/
module.exports.ABOUT_OVERRIDE = {};

/**
  Adds new pages to the /about hierarchy

  This option is an array of objects. The format should be:
  ```
  {
    url: path name, excluding /about part
    title: page title
    view: name of pug file
  }
  ```
*/
module.exports.EXTRA_ABOUT_PAGES = [];

/**
  Adds new links to the navbar

  This option is an array of objects. The format should be:
  ```
  {
    url: link URL
    title: link title
  }
  ```
*/
module.exports.EXTRA_NAVBAR = [];

/**
  Additional origins that should be allowed to make Cookie-authenticated
  API requests.

  Note: this is a very unsafe option, and can easily lead to credential
  leaks. Use this at your own risk.
*/
module.exports.EXTRA_ORIGINS = [];

/**
  The base URL used for OAuth redirects

  This is used by the OAuth configuration mechanism for accounts/devices
  in Web Almond. It is used by Login With Google. The full OAuth redirect
  URI for Google is OAUTH_REDIRECT_ORIGIN + `/user/oauth2/google/callback`

  By default, it is the same as SERVER_ORIGIN, but you can change it
  if you put a different value in the developer console / redirect URI
  fields of the various services.
*/
module.exports.OAUTH_REDIRECT_ORIGIN = module.exports.SERVER_ORIGIN;

/**
  Enable anonymous user.

  Set this option to true to let users try out Almond without logging in.
  They will operate as the user "anonymous".
*/
module.exports.ENABLE_ANONYMOUS_USER = false;

/**
  LUInet (Natural Language model/server) configuration

  Set this to 'external' for a configuration using a public Natural Language
  server, and 'embedded' if you manage your own NLP server.

  Setting this to 'embedded' enables the configuration UI to manage models
  and train.
*/
module.exports.WITH_LUINET = 'external';

/**
  The URL of a genie-compatible Natural Language inference server.

  This must be set to the full URL both if you use the public NL inference
  server, and if you use the embedded server.
*/
module.exports.NL_SERVER_URL = 'https://almond-nl.stanford.edu';
/**
  Access token for administrative operations in the NLP inference server.

  This tokens controls the ability to reload models from disk. It should
  be shared between the NLP training server and NLP inference server.

  This must be not null if `WITH_LUINET` is set to 'embedded'.
*/
module.exports.NL_SERVER_ADMIN_TOKEN = null;
/**
  Developer key to use from the NLP server to access Thingpedia.

  Set this key to your Thingpedia developer key if you're configuring a custom
  NLP server but you want to use the public Thingpedia.
*/
module.exports.NL_THINGPEDIA_DEVELOPER_KEY = null;

/**
  Training server URL.

  This URL will be called from the Thingpedia web server when a new device
  is updated.
*/
module.exports.TRAINING_URL = null;

/**
  Access token for the training server.

  This token protects all requests to the training server.
*/
module.exports.TRAINING_ACCESS_TOKEN = null;

/**
  Configuration file for training.

  Set this to the path to JSON file to override the default options passed
  to `decanlp`. Configuration lives in a separate file so it can be changed
  without restarting the training server (which would stop all running jobs).
*/
module.exports.TRAINING_CONFIG_FILE = null;

/**
  Access key for Bing Image API

  This is used to retrieve icons for entities.
*/
module.exports.BING_KEY = '';

/**
  OAuth Client secret to support Login With Google
*/
module.exports.GOOGLE_CLIENT_SECRET = null;

/**
  OAuth Client ID to support Login With Github

  This cannot be the value `null`, use the string `'null'` to disable
  Login with Github instead.
*/
module.exports.GITHUB_CLIENT_ID = 'null';

/**
  OAuth Client secret to support Login With Github
*/
module.exports.GITHUB_CLIENT_SECRET = null;

/**
   Mailgun user name

   For emails sent from Almond
*/
module.exports.MAILGUN_USER = null;

/**
   Mailgun password

   For emails sent from Almond
*/
module.exports.MAILGUN_PASSWORD = null;

/**
  From: field of user emails (email verification, password reset, etc.)
*/
module.exports.EMAIL_FROM_USER = 'Almond <noreply@almond.stanford.edu>';
/**
  From: field of admin emails (review requests, developer requests, etc.)
*/
module.exports.EMAIL_FROM_ADMIN = 'Almond <root@almond.stanford.edu>';
/**
  From: field of admin-training notifications
*/
module.exports.EMAIL_FROM_TRAINING = 'Almond Training Service <almond-training@almond.stanford.edu>';

/**
  To: field of admin emails

  Automatically generated email notifications (such as training failures)
  will be sent to this address.
*/
module.exports.EMAIL_TO_ADMIN = 'thingpedia-admins@lists.stanford.edu';

/**
  The primary "messaging" device.

  This is offered as the default device to configure for communicating
  assistants, if no other messaging device is available.
*/
module.exports.MESSAGING_DEVICE = 'org.thingpedia.builtin.matrix';

/**
  Enable metric collection using Prometheus.

  If set to `true`, all web servers will expose a Prometheus-compatible `/metrics` endpoint.
*/
module.exports.ENABLE_PROMETHEUS = false;
/**
  Access token to use for /metrics endpoint.

  If null, the endpoint will have no authentication, and metric data will
  be publicly readable.

  This value should match the "bearer_token" prometheus configuration value.
*/
module.exports.PROMETHEUS_ACCESS_TOKEN = null;

/**
  Secret for Discourse Single-Sign-On

  See https://meta.discourse.org/t/official-single-sign-on-for-discourse-sso/13045
  for the protocol.

  SSO will be disabled (404 error) if SSO_SECRET or SSO_REDIRECT is null.

  Unlike OAuth, there is no "confirm" step before user's data is sent to the
 requesting service, hence this secret REALLY must be secret.
*/
module.exports.DISCOURSE_SSO_SECRET = null;
/**
  Redirect URL for Discourse Single-Sign-On.

  Set this to the URL of your Discourse installation. This should be the origin
  (scheme-hostname-port) only, `/session/sso_login` will be appended.
*/
module.exports.DISCOURSE_SSO_REDIRECT = null;

/**
   What natural languages are enabled, as BCP47 locale tags.

  Defaults to American English only

  Note that this must contain at least one language, or the server will fail
  to start.
*/
module.exports.SUPPORTED_LANGUAGES = ['en-US'];
