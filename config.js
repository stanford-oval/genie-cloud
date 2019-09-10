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
  and all shards have access to shared storage (e.g. NFS).
  If the storage is not shared, use the `get-user-shards` to compute which user is
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

  You should configure your CDN to map the URL you specify here to the /assets
  path on the frontend server (SERVER_ORIGIN setting).

  Use a fully qualified URL (including https://) and omit the trailing slash.
  Use the default `/assets` if you do not want to use a CDN, in which case assets will
  be loaded directly from your configured frontend server.
*/
module.exports.ASSET_CDN = '/assets';

/**
  Which branding to use for the website.

  Valid values are "generic" (no branding) or "stanford" (Stanford University logo and
  footer). Note that the Stanford University logo is a registered trademark, and therefore
  using "stanford" branding requires permission.
*/
module.exports.USE_BRAND = 'generic';

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
  Enable developer program.

  Set this option to allow users to become Almond developers, and create
  OAuth apps that access the Web Almond APIs, as well as new Thingpedia
  devices or LUInet models.
*/
module.exports.ENABLE_DEVELOPER_PROGRAM = false;

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
  The address (socket path or host:port) of a running Almond Tokenizer.

  This is only used if WITH_LUINET === 'embedded'. If the environment
  variable `THINGENGINE_USE_TOKENIZER` is set, it is used by both the
  frontend and the NLP processes; otherwise, only by the NLP process.
*/
module.exports.NL_TOKENIZER_ADDRESS = '127.0.0.1:8888';

/**
  Deployed model directory.

  This is the path containing the models that should be served by the NLP inference
  server. It can be a relative or absolute path, or a file: or s3: URI.

  For a file URI, if the training and inference servers are on different machines,
  you should specify the hostname of the inference server. The training server will
  use `rsync` to upload the model after training.

  If this is set to `null`, trained models will not be uploaded to a NLP inference
  server. This is not a valid setting for the inference server.
*/
module.exports.NL_MODEL_DIR = './models';

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
  Maximum memory usage for training processes.

  In megabytes.
*/
module.exports.TRAINING_MEMORY_USAGE = 24000;

/**
  The directory to use to store training jobs (datasets, working directories and trained models).

  This can be a relative or absolute path, or a file: or s3: URI.

  NOTE: correct operation requires file: URIs to use the local hostname, that is, they should
  be of the form `file:///`, with 3 consecutive slashes.
*/
module.exports.TRAINING_DIR = './training';

/**
  Which backend to use to run compute-intensive training tasks.

  Valid options are `local`, which spawns a local process, and `kubernetes`, which creates
  a Kubernetes Job. If `kubernetes` is chosen, the training controller must be executed in
  a training cluster and must run a service account with sufficient privileges to create and watch Jobs.
*/
module.exports.TRAINING_TASK_BACKEND = 'local';

/**
  The Docker image to use for training using Kubernetes.

  The suffix `-cuda` will be appended to the version for GPU training.
*/
module.exports.TRAINING_KUBERNETES_IMAGE = 'stanfordoval/almond-cloud:latest-decanlp';

/**
  The namespace for Kubernetes Jobs created for training.
*/
module.exports.TRAINING_KUBERNETES_NAMESPACE = 'default';

/**
  Prefix to add to the Kubernetes Jobs and Pods created for training.
*/
module.exports.TRAINING_KUBERNETES_JOB_NAME_PREFIX = '';

/**
  Additional labels to add to the Kubernetes Jobs and Pods created for training.
*/
module.exports.TRAINING_KUBERNETES_EXTRA_METADATA_LABELS = {};

/**
  Additional fields to add to the Kubernetes Pods created for training.
*/
module.exports.TRAINING_KUBERNETES_POD_SPEC_OVERRIDE = {};

/**
  Additional fields to add to the Kubernetes Pods created for training.
*/
module.exports.TRAINING_KUBERNETES_CONTAINER_SPEC_OVERRIDE = {};

/**
  Directory in s3:// or file:// URI, where tensboard events are synced to during training.
*/
module.exports.TENSORBOARD_DIR = null;

/**
  URL of documentation.

  Set this to a string starting with `/doc` to enable the embedded documentation site. Alternatively,
  point to a public website hosting your documentation.
*/
module.exports.DOCUMENTATION_URL = 'https://almond.stanford.edu/doc/getting-started.md';

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

/**
  MapQuest API key.

  This is key is used to provide the location querying API. If unset, it will
  fallback to the public Nominatim API, which has a low API quota.
*/
module.exports.MAPQUEST_KEY = null;
 
/**
  Enable on demand gpu training.

  If true, will start a gpu node when a training request comes in and shuts down
  the gpu node when training is done.
*/
module.exports.ENABLE_ON_DEMAND_GPU_TRAINING = false;

/**
  GPU training region

  The AWS region where GPU training cluster is created.
*/
module.exports.GPU_REGION = null;

/**
  GPU training cluster

  The name of gpu training cluster.
*/
module.exports.GPU_CLUSTER = null;

/**
  GPU training node group.

  The name of the gpu nodegroup in the training cluster.
*/
module.exports.GPU_NODE_GROUP = null;

/**
  S3 work dir for GPU training.

  S3 directory for temporary workdir storage.
*/
module.exports.GPU_S3_WORKDIR = null;
