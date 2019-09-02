# Cloud Almond Configuration Options Reference

## DATABASE_URL
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

Default value: `process.env.DATABASE_URL`

## SECRET_KEY
Secret key for cookie signing.

This can be an arbitrary secret string. It is recommended to choose 64 random HEX characters (256 bit security).
Choose a secure secret to prevent session hijacking.

For legacy reasons, this defaults to the `SECRET_KEY` environment variable.
Using environment variables is currently secure but deprecated (because it can lead to security bugs).
The server will refuse to start if this option is not set.

Default value: `process.env.SECRET_KEY`

## JWT_SIGNING_KEY
Secret key for JsonWebToken signing (OAuth 2.0 tokens)

This can be an arbitrary secret string. It is recommended to choose 64 random HEX characters (256 bit security).
Choose a secure secret to prevent forging OAuth access tokens.

For legacy reasons, this defaults to the `JWT_SIGNING_KEY` environment variable.
Using environment variables is currently secure but deprecated (because it can lead to security bugs).
The server will refuse to start if this option is not set.

Default value: `process.env.JWT_SIGNING_KEY`

## AES_SECRET_KEY
Symmetric encryption key for user authentication material

This key is used whenever user-authentication-related secret material must be encrypted symmetrically,
rather than simply hashed. In particular, it is used to encrypt and decrypt per-user 2-factor keys.

This secret must be exactly 32 hex characters (128 bits).

For legacy reasons, this defaults to the `AES_SECRET_KEY` environment variable.
Using environment variables is currently secure but deprecated (because it can lead to security bugs).
The server will refuse to start if this option is not set.

Default value: `process.env.AES_SECRET_KEY`

## THINGENGINE_MANAGER_ADDRESS
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

Default value: `['./control']`

## THINGENGINE_MANAGER_AUTHENTICATION
Access token to communicate with the master process.

This **must** be set if communication happens over to TCP, but can be left to
the default `null` value if communication happens over Unix domain sockets, in which
case file system permissions are used to restrict access.

Default value: `null`

## WITH_THINGPEDIA
Thingpedia configuration.

Set this option to 'embedded' to enable the embedded Thingpedia,
to 'external' to use the Thingpedia at THINGPEDIA_URL.

Default value: `'external'`

## THINGPEDIA_URL
Thingpedia URL

This is used by the Almond backend to communicate with the external Thingpedia,
and it is also used to construct links to Thingpedia from My Almond.
It **must** be set to `'/thingpedia'` to use the embedded Thingpedia.

Default value: `'https://thingpedia.stanford.edu/thingpedia'`

## FILE_STORAGE_BACKEND
Where to store icons and zip files.

Set this option to s3 to use Amazon S3, local to use the local filesystem
(which must be configured with the correct permissions).

Default value: `'local'`

## CDN_HOST
The location where icons and zip files are stored.

If using the S3 storage backend, this could be the S3 website URL, or the URL
of a CloudFront distribution mapping to the S3 bucket.
If using the `local` storage backend, it must be the exact string `"/download"`.

Default value: `'/download'`

## ASSET_CDN
The CDN to use for website assets (javascript, css, images files contained in public/ )

You should configure your CDN to map the URL you specify here to the /assets
path on the frontend server (SERVER_ORIGIN setting).

Use a fully qualified URL (including https://) and omit the trailing slash.
Use the default `/assets` if you do not want to use a CDN, in which case assets will
be loaded directly from your configured frontend server.

Default value: `'/assets'`

## USE_BRAND
Which branding to use for the website.

Valid values are "generic" (no branding) or "stanford" (Stanford University logo and
footer). Note that the Stanford University logo is a registered trademark, and therefore
using "stanford" branding requires permission.

Default value: `'generic'`

## SERVER_ORIGIN
The origin (scheme, hostname, port) where the server is reachable.

This is used for redirects and CORS checks.

Default value: `'http://127.0.0.1:8080'`

## ENABLE_REDIRECT
Enable redirection to SERVER_ORIGIN for requests with different hostname
or scheme.

Use this to enable transparent HTTP to HTTPS redirection.

Default value: `true`

## ENABLE_SECURITY_HEADERS
Enable HTTPs security headers.

Enable Strict-Transport-Security, Content-Security-Policy and other
headers. This option has no effect if the server is not available over TLS.

Default value: `false`

## ABOUT_OVERRIDE
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

Default value: `{}`

## EXTRA_ABOUT_PAGES
Adds new pages to the /about hierarchy

This option is an array of objects. The format should be:
```
{
  url: path name, excluding /about part
  title: page title
  view: name of pug file
}
```

Default value: `[]`

## EXTRA_NAVBAR
Adds new links to the navbar

This option is an array of objects. The format should be:
```
{
  url: link URL
  title: link title
}
```

Default value: `[]`

## EXTRA_ORIGINS
Additional origins that should be allowed to make Cookie-authenticated
API requests.

Note: this is a very unsafe option, and can easily lead to credential
leaks. Use this at your own risk.

Default value: `[]`

## OAUTH_REDIRECT_ORIGIN
The base URL used for OAuth redirects

This is used by the OAuth configuration mechanism for accounts/devices
in Web Almond. It is used by Login With Google. The full OAuth redirect
URI for Google is OAUTH_REDIRECT_ORIGIN + `/user/oauth2/google/callback`

By default, it is the same as SERVER_ORIGIN, but you can change it
if you put a different value in the developer console / redirect URI
fields of the various services.

Default value: `module.exports.SERVER_ORIGIN`

## ENABLE_ANONYMOUS_USER
Enable anonymous user.

Set this option to true to let users try out Almond without logging in.
They will operate as the user "anonymous".

Default value: `false`

## ENABLE_DEVELOPER_PROGRAM
Enable developer program.

Set this option to allow users to become Almond developers, and create
OAuth apps that access the Web Almond APIs, as well as new Thingpedia
devices or LUInet models.

Default value: `false`

## WITH_LUINET
LUInet (Natural Language model/server) configuration

Set this to 'external' for a configuration using a public Natural Language
server, and 'embedded' if you manage your own NLP server.

Setting this to 'embedded' enables the configuration UI to manage models
and train.

Default value: `'external'`

## NL_SERVER_URL
The URL of a genie-compatible Natural Language inference server.

This must be set to the full URL both if you use the public NL inference
server, and if you use the embedded server.

Default value: `'https://almond-nl.stanford.edu'`

## NL_SERVER_ADMIN_TOKEN
Access token for administrative operations in the NLP inference server.

This tokens controls the ability to reload models from disk. It should
be shared between the NLP training server and NLP inference server.

This must be not null if `WITH_LUINET` is set to 'embedded'.

Default value: `null`

## NL_THINGPEDIA_DEVELOPER_KEY
Developer key to use from the NLP server to access Thingpedia.

Set this key to your Thingpedia developer key if you're configuring a custom
NLP server but you want to use the public Thingpedia.

Default value: `null`

## NL_TOKENIZER_ADDRESS
The address (socket path or host:port) of a running Almond Tokenizer.

This is only used if WITH_LUINET === 'embedded'. If the environment
variable `THINGENGINE_USE_TOKENIZER` is set, it is used by both the
frontend and the NLP processes; otherwise, only by the NLP process.

Default value: `'127.0.0.1:8888'`

## NL_MODEL_DIR
Deployed model directory on S3.

Set this path if you want to use s3 to store deployed models.

Default value: `null`

## TRAINING_URL
Training server URL.

This URL will be called from the Thingpedia web server when a new device
is updated.

Default value: `null`

## TRAINING_ACCESS_TOKEN
Access token for the training server.

This token protects all requests to the training server.

Default value: `null`

## TRAINING_CONFIG_FILE
Configuration file for training.

Set this to the path to JSON file to override the default options passed
to `decanlp`. Configuration lives in a separate file so it can be changed
without restarting the training server (which would stop all running jobs).

Default value: `null`

## TRAINING_MEMORY_USAGE
Maximum memory usage for training processes.

In megabytes.

Default value: `24000`

## DOCUMENTATION_URL
URL of documentation.

Set this to a string starting with `/doc` to enable the embedded documentation site. Alternatively,
point to a public website hosting your documentation.

Default value: `'https://almond.stanford.edu/doc/getting-started.md'`

## BING_KEY
Access key for Bing Image API

This is used to retrieve icons for entities.

Default value: `''`

## GOOGLE_CLIENT_SECRET
OAuth Client secret to support Login With Google

Default value: `null`

## GITHUB_CLIENT_ID
OAuth Client ID to support Login With Github

This cannot be the value `null`, use the string `'null'` to disable
Login with Github instead.

Default value: `'null'`

## GITHUB_CLIENT_SECRET
OAuth Client secret to support Login With Github

Default value: `null`

## MAILGUN_USER
 Mailgun user name

 For emails sent from Almond

Default value: `null`

## MAILGUN_PASSWORD
 Mailgun password

 For emails sent from Almond

Default value: `null`

## EMAIL_FROM_USER
From: field of user emails (email verification, password reset, etc.)

Default value: `'Almond <noreply@almond.stanford.edu>'`

## EMAIL_FROM_ADMIN
From: field of admin emails (review requests, developer requests, etc.)

Default value: `'Almond <root@almond.stanford.edu>'`

## EMAIL_FROM_TRAINING
From: field of admin-training notifications

Default value: `'Almond Training Service <almond-training@almond.stanford.edu>'`

## EMAIL_TO_ADMIN
To: field of admin emails

Automatically generated email notifications (such as training failures)
will be sent to this address.

Default value: `'thingpedia-admins@lists.stanford.edu'`

## MESSAGING_DEVICE
The primary "messaging" device.

This is offered as the default device to configure for communicating
assistants, if no other messaging device is available.

Default value: `'org.thingpedia.builtin.matrix'`

## ENABLE_PROMETHEUS
Enable metric collection using Prometheus.

If set to `true`, all web servers will expose a Prometheus-compatible `/metrics` endpoint.

Default value: `false`

## PROMETHEUS_ACCESS_TOKEN
Access token to use for /metrics endpoint.

If null, the endpoint will have no authentication, and metric data will
be publicly readable.

This value should match the "bearer_token" prometheus configuration value.

Default value: `null`

## DISCOURSE_SSO_SECRET
Secret for Discourse Single-Sign-On

See https://meta.discourse.org/t/official-single-sign-on-for-discourse-sso/13045
for the protocol.

SSO will be disabled (404 error) if SSO_SECRET or SSO_REDIRECT is null.

Unlike OAuth, there is no "confirm" step before user's data is sent to the
equesting service, hence this secret REALLY must be secret.

Default value: `null`

## DISCOURSE_SSO_REDIRECT
Redirect URL for Discourse Single-Sign-On.

Set this to the URL of your Discourse installation. This should be the origin
(scheme-hostname-port) only, `/session/sso_login` will be appended.

Default value: `null`

## SUPPORTED_LANGUAGES
What natural languages are enabled, as BCP47 locale tags.

Defaults to American English only

Note that this must contain at least one language, or the server will fail
to start.

Default value: `['en-US']`

## MAPQUEST_KEY
MapQuest API key.

This is key is used to provide the location querying API. If unset, it will
fallback to the public Nominatim API, which has a low API quota.

Default value: `null`

## ENABLE_ON_DEMAND_GPU_TRAINING
Enable on demand gpu training.

If true, will start a gpu node when a training request comes in and shuts down
the gpu node when training is done.

Default value: `false`

## GPU_REGION
GPU training region

The AWS region where GPU training cluster is created.

Default value: `null`

## GPU_CLUSTER
GPU training cluster

The name of gpu training cluster.

Default value: `null`

## GPU_NODE_GROUP
GPU training node group.

The name of the gpu nodegroup in the training cluster.

Default value: `null`

## GPU_S3_WORKDIR
S3 work dir for GPU training.

S3 directory for temporary workdir storage.

Default value: `null`

## GPU_SQS_REQUEST_URL
SQS request URL for GPU training.

The SQS FIFO queue URL used to submit GPU training requests to GPU node.

Default value: `null`

## GPU_SQS_RESPONSE_URL
SQS response URL for GPU training.

The SQS FIFO queue URL used to submit GPU training resposne from GPU node.

Default value: `null`

