// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

import type * as Genie from 'genie-toolkit';

/* eslint prefer-const: off, @typescript-eslint/no-inferrable-types: off */

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
export let DATABASE_URL : string|undefined = process.env.DATABASE_URL;

/**
  Database Proxy URL.

  This the URL of the dbproxy server setup in the kubernetes cluster. If set, worker engine will use the
  cloud database through the proxy. Otherwise, a local sqlitedb is used.
*/
export let DATABASE_PROXY_URL : string|null = null;

/**
  Secret key for cookie signing.

  This can be an arbitrary secret string. It is recommended to choose 64 random HEX characters (256 bit security).
  Choose a secure secret to prevent session hijacking.

  For legacy reasons, this defaults to the `SECRET_KEY` environment variable.
  Using environment variables is currently secure but deprecated (because it can lead to security bugs).
  The server will refuse to start if this option is not set.
*/
export let SECRET_KEY : string = process.env.SECRET_KEY!;

/**
  Secret key for JsonWebToken signing (OAuth 2.0 tokens)

  This can be an arbitrary secret string. It is recommended to choose 64 random HEX characters (256 bit security).
  Choose a secure secret to prevent forging OAuth access tokens.

  For legacy reasons, this defaults to the `JWT_SIGNING_KEY` environment variable.
  Using environment variables is currently secure but deprecated (because it can lead to security bugs).
  The server will refuse to start if this option is not set.
*/
export let JWT_SIGNING_KEY : string = process.env.JWT_SIGNING_KEY!;

/**
  Symmetric encryption key for user authentication material

  This key is used whenever user-authentication-related secret material must be encrypted symmetrically,
  rather than simply hashed. In particular, it is used to encrypt and decrypt per-user 2-factor keys.

  This secret must be exactly 32 hex characters (128 bits).

  For legacy reasons, this defaults to the `AES_SECRET_KEY` environment variable.
  Using environment variables is currently secure but deprecated (because it can lead to security bugs).
  The server will refuse to start if this option is not set.
*/
export let AES_SECRET_KEY : string = process.env.AES_SECRET_KEY!;


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
export let THINGENGINE_MANAGER_ADDRESS : string[] = ['./control'];
/**
  Access token to communicate with the master process.

  This **must** be set if communication happens over to TCP, but can be left to
  the default `null` value if communication happens over Unix domain sockets, in which
  case file system permissions are used to restrict access.
*/
export let THINGENGINE_MANAGER_AUTHENTICATION : string|null = null;

/**
  Thingpedia configuration.

  Set this option to 'embedded' to enable the embedded Thingpedia,
  to 'external' to use the Thingpedia at THINGPEDIA_URL.
*/
export let WITH_THINGPEDIA : 'external'|'embedded' = 'external';
/**
  Thingpedia URL

  This is used by the Almond backend to communicate with the external Thingpedia,
  and it is also used to construct links to Thingpedia from My Almond.
  It **must** be set to `'/thingpedia'` to use the embedded Thingpedia.
*/
export let THINGPEDIA_URL : string = 'https://thingpedia.stanford.edu/thingpedia';
/**
  Default Thingpedia developer key to use for Web Almond.

  In external Thingpedia mode, this Thingpedia key will be made available to all
  users that do not have another key configured, so they can access private devices
  from the external Thingpedia.

  The developer program must be disabled for this key to have any effect
  (ENABLE_DEVELOPER_PROGRAM = false), and this key has no effect in embedded Thingpedia mode.

  This key only affects users running Web Almond. To configure the key used by
  the embedded NLP server, set NL_THINGPEDIA_DEVELOPER_KEY.
*/
export let THINGPEDIA_DEVELOPER_KEY : string|null = null;
/**
  Thingpedia developer key to use for the root user in Web Almond.

  In external Thingpedia mode, the initially created root user and all users in the
  root organization will use this developer key. If unset, the root user will use a
  randomly generated Thingpedia key.

  This key has no effect in embedded Thingpedia mode.
*/
export let ROOT_THINGPEDIA_DEVELOPER_KEY : string|null = null;

/**
  Where to store icons and zip files.

  This can be a relative or absolute path, or a file: or s3: URI.
  The location must be writable by the frontend Almond processes.
  Relative paths are interpreted relative to the current working directory, or
  the `THINGENGINE_ROOTDIR` environment variable if set.

  NOTE: correct operation requires file: URIs to use the local hostname, that is, they should
  be of the form `file:///`, with 3 consecutive slashes.
*/
export let FILE_STORAGE_DIR : string = './shared/download';

/**
  Where to cache entity icons and contact avatars.

  This can be a relative or absolute path.
  The location must be writable by the frontend Almond processes.
  Relative paths are interpreted relative to the current working directory, or
  the `THINGENGINE_ROOTDIR` environment variable if set.

  Note: unlike other _DIR configuration keys, this key cannot be a URL. The cache directory
  is always on the local machine where the Almond process runs.
*/
export let CACHE_DIR : string = './shared/cache';

/**
  The location where icons and zip files can be retrieved.

  If using S3 storage, this could be the S3 website URL, or the URL
  of a CloudFront distribution mapping to the S3 bucket.
  If using local storage, or if no CDN is available, it must be the
  exact string `"/download"`.
*/
export let CDN_HOST : string = '/download';

/**
  The CDN to use for website assets (javascript, css, images files contained in public/ )

  You should configure your CDN to map the URL you specify here to the /assets
  path on the frontend server (SERVER_ORIGIN setting).

  Use a fully qualified URL (including https://) and omit the trailing slash.
  Use the default `/assets` if you do not want to use a CDN, in which case assets will
  be loaded directly from your configured frontend server.
*/
export let ASSET_CDN : string = '/assets';

/**
  Which branding to use for the website.

  Valid values are "generic" (no branding) or "stanford" (Stanford University logo and
  footer). Note that the Stanford University logo is a registered trademark, and therefore
  using "stanford" branding requires permission.
*/
export let USE_BRAND : string = 'generic';

/**
  An optional warning message to show on the registration page.

  This can be used on testing versions of Genie to inform people that they are accessing an
  unstable system.

  HTML is allowed in this configuration key.
*/
module.exports.REGISTRATION_WARNING = null;

/**
  The origin (scheme, hostname, port) where the server is reachable.

  This is used for redirects and CORS checks.
*/
export let SERVER_ORIGIN : string = 'http://127.0.0.1:8080';

/**
  Enable redirection to SERVER_ORIGIN for requests with different hostname
  or scheme.

  Use this to enable transparent HTTP to HTTPS redirection.
*/
export let ENABLE_REDIRECT : boolean = true;

/**
  Enable HTTPs security headers.

  Enable Strict-Transport-Security, Content-Security-Policy and other
  headers. This option has no effect if the server is not available over TLS.
*/
export let ENABLE_SECURITY_HEADERS : boolean = false;

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
export let ABOUT_OVERRIDE : Record<string, string> = {};

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
export let EXTRA_ABOUT_PAGES : Array<{ url : string, title : string, view : string }> = [];

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
export let EXTRA_NAVBAR : Array<{ url : string, title : string }> = [];

/**
  Registration warning

  This is a bit of HTML that can be shown on the registration page.
  It can be useful to warn about development or unstable servers.

  If set, it must be valid HTML. It will be shown inside a Boostrap
  alert component. *No sanitization is applied!*
*/
export let REGISTRATION_WARNING : string|null = null;

/**
  Additional origins that should be allowed to make Cookie-authenticated
  API requests.

  Note: this is a very unsafe option, and can easily lead to credential
  leaks. Use this at your own risk.
*/
export let EXTRA_ORIGINS : string[] = [];

/**
  The base URL used for OAuth redirects

  This is used by the OAuth configuration mechanism for accounts/devices
  in Web Almond. It is used by Login With Google. The full OAuth redirect
  URI for Google is OAUTH_REDIRECT_ORIGIN + `/user/oauth2/google/callback`

  By default, it is the same as SERVER_ORIGIN, but you can change it
  if you put a different value in the developer console / redirect URI
  fields of the various services.
*/
export let OAUTH_REDIRECT_ORIGIN : string = SERVER_ORIGIN;

/**
  Enable anonymous user.

  Set this option to true to let users try out Almond without logging in.
  They will operate as the user "anonymous".
*/
export let ENABLE_ANONYMOUS_USER : boolean = false;

/**
  Enable developer program.

  Set this option to allow users to become Almond developers, and create
  OAuth apps that access the Web Almond APIs, as well as new Thingpedia
  devices or LUInet models.
*/
export let ENABLE_DEVELOPER_PROGRAM : boolean = false;

/**
  Enable developer backend.

  User dedicated pod to host trusted developer backend. This will increase
  startup time of the developer as a new pod will be spin up from a cold start.
*/
export let ENABLE_DEVELOPER_BACKEND : boolean = false;

/**
  LUInet (Natural Language model/server) configuration

  Set this to 'external' for a configuration using a public Natural Language
  server, and 'embedded' if you manage your own NLP server.

  Setting this to 'embedded' enables the configuration UI to manage models
  and train.
*/
export let WITH_LUINET : 'embedded'|'external' = 'external';

/**
  The URL of a genie-compatible Natural Language inference server.

  This must be set to the full URL both if you use the public NL inference
  server, and if you use the embedded server.
*/
export let NL_SERVER_URL : string = 'https://almond-nl.stanford.edu';
/**
  Access token for administrative operations in the NLP inference server.

  This tokens controls the ability to reload models from disk. It should
  be shared between the NLP training server and NLP inference server.

  This must be not null if `WITH_LUINET` is set to 'embedded'.
*/
export let NL_SERVER_ADMIN_TOKEN : string|null = null;
/**
  Developer key to use from the NLP server to access Thingpedia.

  Set this key to your Thingpedia developer key if you're configuring a custom
  NLP server but you want to use the public Thingpedia.

  This key only affects the embedded NLP server. To configure the key used by
  users running Web Almond and talking to this NLP server, set THINGPEDIA_DEVELOPER_KEY.
*/
export let NL_THINGPEDIA_DEVELOPER_KEY : string|null = null;

/**
  Deployed model directory.

  This is the path containing the models that should be served by the NLP inference
  server. It can be a relative or absolute path, or a file: or s3: URI.
  Relative paths are interpreted relative to the current working directory, or
  the `THINGENGINE_ROOTDIR` environment variable if set.

  For a file URI, if the training and inference servers are on different machines,
  you should specify the hostname of the inference server. The training server will
  use `rsync` to upload the model after training.

  If this is set to `null`, trained models will not be uploaded to a NLP inference
  server. This is not a valid setting for the inference server.
*/
export let NL_MODEL_DIR : string = './models';

/**
  Directory for exact match files.

  This is the path containing the binary format files for the exact matcher.
  It can be a relative or absolute path, or a file: or s3: URI.
  Relative paths are interpreted relative to the current working directory, or
  the `THINGENGINE_ROOTDIR` environment variable if set.
*/
export let NL_EXACT_MATCH_DIR : string = './exact';

/**
  NLP Service name.

  The kubernetes service name for NLP server.
*/
export let NL_SERVICE_NAME : string = 'nlp';


/**
  Use kf serving inference service.

  Will make HTTP requests to models that are hosted in kf-serving inference service.
*/
export let USE_KF_INFERENCE_SERVICE : boolean = false;

/**
  Training server URL.

  This URL will be called from the Thingpedia web server when a new device
  is updated.
*/
export let TRAINING_URL : string|null = null;

/**
  Access token for the training server.

  This token protects all requests to the training server.
*/
export let TRAINING_ACCESS_TOKEN : string|null = null;

/**
  Maximum memory usage for training processes.

  In megabytes.
*/
export let TRAINING_MEMORY_USAGE : number = 24000;

/**
  The directory to use to store training jobs (datasets, working directories and trained models).

  This can be a relative or absolute path, or a file: or s3: URI.
  Relative paths are interpreted relative to the current working directory, or
  the `THINGENGINE_ROOTDIR` environment variable if set.

  NOTE: correct operation requires file: URIs to use the local hostname, that is, they should
  be of the form `file:///`, with 3 consecutive slashes.
*/
export let TRAINING_DIR : string = './training';

/**
  Which backend to use to run compute-intensive training tasks.

  Valid options are `local`, which spawns a local process, and `kubernetes`, which creates
  a Kubernetes Job. If `kubernetes` is chosen, the training controller must be executed in
  a training cluster and must run a service account with sufficient privileges to create and watch Jobs.
*/
export let TRAINING_TASK_BACKEND : 'local'|'kubernetes' = 'local';

/**
  The Docker image to use for training using Kubernetes.

  The suffix `-cuda` will be appended to the version for GPU training.
*/
export let TRAINING_KUBERNETES_IMAGE : string = 'stanfordoval/almond-cloud:latest-decanlp';

/**
  The namespace for Kubernetes Jobs created for training.
*/
export let TRAINING_KUBERNETES_NAMESPACE : string = 'default';

/**
  Prefix to add to the Kubernetes Jobs and Pods created for training.
*/
export let TRAINING_KUBERNETES_JOB_NAME_PREFIX : string = '';

/**
  Additional labels to add to the Kubernetes Jobs and Pods created for training.

  @type {Record<string, unknown>}
*/
export let TRAINING_KUBERNETES_EXTRA_METADATA_LABELS = {};

/**
  Additional annotations to add to the Kubernetes Jobs and Pods created for training.
*/
export let TRAINING_KUBERNETES_EXTRA_ANNOTATIONS : Record<string, unknown> = {};

/**
  Additional fields to add to the Kubernetes Pods created for training.
*/
export let TRAINING_KUBERNETES_POD_SPEC_OVERRIDE : Record<string, unknown> = {};

/**
  Additional fields to add to the Kubernetes Pods created for training.
*/
export let TRAINING_KUBERNETES_CONTAINER_SPEC_OVERRIDE : Record<string, unknown> = {};

/**
  Number of tries to watch k8s job status. Setting to a negative number will try indefinitely.
*/
export let TRAINING_WATCH_NUM_TRIES : number = 5;

/**
  Directory in s3:// or file:// URI, where tensorboard events are synced to during training.
*/
export let TENSORBOARD_DIR : string|null = null;

/**
  OAuth Client ID to support Login With Google
*/
export let GOOGLE_CLIENT_ID : string|null = null;

/**
  OAuth Client secret to support Login With Google
*/
export let GOOGLE_CLIENT_SECRET : string|null = null;

/**
  OAuth Client ID to support Login With Github
*/
export let GITHUB_CLIENT_ID : string|null = null;

/**
  OAuth Client secret to support Login With Github
*/
export let GITHUB_CLIENT_SECRET : string|null = null;

/**
   Mailgun user name

   For emails sent from Almond
*/
export let MAILGUN_USER : string|null = null;

/**
   Mailgun password

   For emails sent from Almond
*/
export let MAILGUN_PASSWORD : string|null = null;

/**
  From: field of user emails (email verification, password reset, etc.)
*/
export let EMAIL_FROM_USER : string = 'Genie <noreply@almond.stanford.edu>';
/**
  From: field of admin emails (review requests, developer requests, etc.)
*/
export let EMAIL_FROM_ADMIN : string = 'Genie <root@almond.stanford.edu>';
/**
  From: field of admin-training notifications
*/
export let EMAIL_FROM_TRAINING : string = 'Genie Training Service <genie-training@almond.stanford.edu>';

/**
  To: field of admin emails

  Automatically generated email notifications (such as training failures)
  will be sent to this address.
*/
export let EMAIL_TO_ADMIN : string = 'thingpedia-admins@lists.stanford.edu';

/**
  The primary "messaging" device.

  This is offered as the default device to configure for communicating
  assistants, if no other messaging device is available.
*/
export let MESSAGING_DEVICE : string = 'org.thingpedia.builtin.matrix';

/**
  Enable metric collection using Prometheus.

  If set to `true`, all web servers will expose a Prometheus-compatible `/metrics` endpoint.
*/
export let ENABLE_PROMETHEUS : boolean = false;
/**
  Access token to use for /metrics endpoint.

  If null, the endpoint will have no authentication, and metric data will
  be publicly readable.

  This value should match the "bearer_token" prometheus configuration value.
*/
export let PROMETHEUS_ACCESS_TOKEN : string|null = null;

/**
  Secret for Discourse Single-Sign-On

  See https://meta.discourse.org/t/official-single-sign-on-for-discourse-sso/13045
  for the protocol.

  SSO will be disabled (404 error) if SSO_SECRET or SSO_REDIRECT is null.

  Unlike OAuth, there is no "confirm" step before user's data is sent to the
 requesting service, hence this secret REALLY must be secret.
*/
export let DISCOURSE_SSO_SECRET : string|null = null;
/**
  Redirect URL for Discourse Single-Sign-On.

  Set this to the URL of your Discourse installation. This should be the origin
  (scheme-hostname-port) only, `/session/sso_login` will be appended.
*/
export let DISCOURSE_SSO_REDIRECT : string|null = null;

/**
  What natural languages are enabled, as BCP47 locale tags.

  Defaults to American English only

  Note that this must contain at least one language, or the server will fail
  to start.
*/
export let SUPPORTED_LANGUAGES : string[] = ['en-US'];

/**
  MapQuest API key.

  This is key is used to provide the location querying API. If unset, it will
  fallback to the public Nominatim API, which has a low API quota.
*/
export let MAPQUEST_KEY : string|null = null;

/**
  URL of an [Ackee](https://github.com/electerious/Ackee) server to use for page tracking.

  This property must contain the full URL (protocol, hostname, optional port) of the server,
  and must not end with a slash.
  If null, tracking will be disabled.
*/
export let ACKEE_URL : string|null = null;

/**
  Domain ID to use for [Ackee](https://github.com/electerious/Ackee) tracking.

  This must be set if `ACKEE_URL` is set.
*/
export let ACKEE_DOMAIN_ID : string|null = null;

/**
  URL of a server supporting speech-to-text and text-to-speech.
*/
export let VOICE_SERVER_URL : string = 'https://voice.almond.stanford.edu';

/**
  Azure subscription key for Microsoft Speech Services SDK
*/
export let MS_SPEECH_SUBSCRIPTION_KEY : string|null = null;

/**
  Azure region identifier for Microsoft Speech Services SDK
*/
export let MS_SPEECH_SERVICE_REGION : string|null = null;

/**
 * FAQ models to enable.
 */
export let FAQ_MODELS : Record<string, { url : string, highConfidence ?: number, lowConfidence ?: number }> = {};

/**
 * Configuration parameters for builtin notification modules.
 */
export let NOTIFICATION_CONFIG : Genie.DialogueAgent.NotificationConfig = {};

/**
 * Additional environment variables to set for the almond workers.
 */
export let EXTRA_ENVIRONMENT : Record<string, string> = {};
