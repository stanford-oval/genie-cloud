# Cloud Almond Installation and Configuration Guide

Ok, so you decided that you don't trust those folks at Stanford to run
[almond.stanford.edu](https://almond.stanford.edu) safely? Or maybe you
have developed a bunch of cool new features that you want to test locally?
This is the guide for you.

Specifically, this is the guide for system administrators and system
integrators that want to set up a public multi-user Almond instance.

## Choose Your Own Adventure

Cloud Almond can be installed in three different configurations. Each
level of configuration varies which services you provide on your own,
and which you reuse from the public Almond instance.

The basic form is to deploy **Web Almond only**. In this configuration,
you provide a web service for users to sign in and use Almond. You can
configure branding, login and customer feedback, and you are responsible
to collect user data and store it safely. On the other hand, in this
configuration you reuse both Thingpedia and the public NLP model from
Almond. This is the simplest configuration, and the one we recommend
to anyone who does not want to use our instance.

The second form is to deploy **Web Almond + NLP**. This configuration
reuses the public Thingpedia, but uses a customized dataset and model.
Use this configuration if you want custom natural language support,
including customized Genie templates, or a model that targets a subset
of Thingpedia.
You must an NLP inference server, and you need to
periodically synchronize your trained models to Thingpedia to reflect any changes
(for example by polling the [Thingpedia API](/doc/thingpedia-api)).
It is also recommended to deploy the NLP training server.

The third form is to deploy a **fully custom Thingpedia**. This is **not**
a recommended configuration, as it is significantly more challenging
to manage. Furthermore, the new Thingpedia requires you to upload the
code and credentials (client IDs, API keys) to all services you care about.
You must also deploy custom NLP models, as the official ones will not
be compatible. Use this setup only if you absolutely need custom Thingpedia
interfaces, and cannot provide these interfaces on Thingpedia. This setup
is also suitable for developing Thingpedia itself. 

### Step 1: Acquiring dependencies

The code depends on:

- nodejs (>= 8.0)
- cvc4 (any version, although >= 1.5 is recommended; only the binary is needed, not the library)
- gm (provided by GraphicsMagic)

Optionally, it depends on:

- libsystemd
- bubblewrap

These dependencies are used for sandboxing and journal integration.

A working MySQL server is also required. We recommend MariaDB >= 10.2 for best compatibility.

For example, on Ubuntu (>= 18.04):
```
sudo apt install nodejs cvc4 graphicsmagick libsystemd-dev bubblewrap -y
```
On Fedora:
```
sudo dnf install nodejs cvc4 GraphicsMagick systemd-devel bubblewrap -y
```


If you would like to run the MySQL server locally:
```
sudo apt install mariadb-server # Ubuntu
sudo dnf install mariadb-server # Fedora
```

This repository uses yarn for dependency tracking.
You should install yarn from [its website](https://yarnpkg.com/en/docs/install).
And then run:

```
yarn install
```

**Note**: due to strict version requirements between the different Almond components, using
npm is not supported.

Finally, if you want to use custom NLP models, you must install `decanlp`:
```
pip3 install --user 'git+https://github.com/stanford-oval/decaNLP.git#egg=decanlp'
```
and you must install [almond-tokenizer](https://github.com/stanford-oval/almond-tokenizer).

#### Setting up database encryption

It is *highly recommended* to encrypt your user's data at rest. To do so, configure your Web Almond to link against
[sqlcipher](https://www.zetetic.net/sqlcipher) instead of sqlite. Place this in your `.yarnrc`:

```
sqlite "/opt/sqlcipher"
sqlite_libname sqlcipher
```

Replace `/opt/sqlcipher` with the actual installation directory of sqlcipher.

Database encryption uses a randomly generated key that is different from each user.

### Step 2: Configuration

You must choose which mode to operate as by editing the `config.js` file. If you don't want to
edit the file in git, you can also create a file called `secret_config.js`, in the same folder,
where you can override any configuration. The format of `config.js` and `secret_config.js` is
the same.

**NOTE:** despite the name, values in `secret_config.js` are **not secret** on the Web Almond machine:
they are accessible inside the individual user sandboxes. Use environment variables if you need true secret tokens,
and store them in a root-only (0600 or 0000) file.

You must first change the `SERVER_ORIGIN` field to point to the correct location (scheme-host-port) of
your Web Almond server. This is the user reachable URL.
Then change the `EMAIL_` fields to indicate that emails are sent from your website, and set `MAILGUN_USER`
and `MAILGUN_PASSWORD` appropriately. 

If you set `ENABLE_REDIRECT` is true, any request with a hostname or scheme that is not that of `SERVER_ORIGIN` will
be redirected to the correct origin. This is support seamless migration between domains, and
transparent upgrade to HTTPS. Once you have set up TLS, you should also set `ENABLE_SECURITY_HEADERS` to true,
which will enable Strict Transport Security, X-Frame-Options and other important security-related HTTP headers.

You can customize the website, by overriding the content of the index and about pages to use different
pug files, using `ABOUT_OVERRIDE`. If you plan to serve Web Almond to users and allow registration,
at the minimum you must override the terms of service page and the privacy policy page, as they
are empty in the default installation. See `stanford/config.js` and `views/stanford` for examples
of how to do so.

If needed, you can also change `OAUTH_REDIRECT_ORIGIN` to set the origin for your OAuth redirects.
The latter is used to support Login With Google, and to configure OAuth-based accounts in Web Almond,
so it must be the same origin that you will configure for OAuth redirect URLs.

Further configuration depends on which mode of Cloud Almond you would like to use.
If you're deploying Web Almond only, leave `NL_SERVER_URL`, `THINGPEDIA_URL` and `TRAINING_URL`
to the default value.

If you're deploying custom NLP, set `NL_SERVER_URL` to the URL (scheme-host-port) of your NLP
inference server, and `NL_SERVER_ADMIN_TOKEN` to a randomly generated token. The latter is
used to authenticate administrative operations on the NLP inference server, such as reloading
newly trained models. It is also recommended to deploy a training server, in which case you should
set `TRAINING_URL` and `TRAINING_ACCESS_TOKEN`.

If you're deploying custom Thingpedia, set `WITH_THINGPEDIA` to `embedded`, and `THINGPEDIA_URL`
to `/thingpedia`. 

If you use the embedded Thingpedia, it is expected you use a CloudFront+S3 to deliver code zip files, icons and other large user generated
content. Set the URL of the CloudFront deployment for user-uploaded content as `CDN_HOST`, and change
`FILE_STORAGE_BACKEND` to `s3`. 
If you do not use CloudFront, zip files and icons will be stored in the public/download folder of your code checkout,
which must be writable.

You can also use a CDN for assets (images, CSS, javascript code included with Cloud Almond).
To do so, set `ASSET_CDN` to a value other than the empty string.
There is no requirement that the asset CDN is on CloudFront, or that it is the same as the user-content CDN.

### Step 2.5 (optional): Enable the sandbox

If you plan to deploy this as a web facing service, and you plan to allow developer users, you
must enable the sandbox to prevent users from accessing each other's data.

Inside the sandbox, the code will have access to `/usr`, a whitelisted subset of `/etc`, and the
directory containing the Web Almond installation. Make sure that these directories do not contain
any private data. In particular, any sensitive data should be stored in `/etc` (including database
passwords or access token), not in the current directory where you installed Web Almond. 

You must also make sure that the current working directory for Web Almond
processes is not under `/usr`, `/etc`, or in the subtree where you cloned Web Almond.
Common correct choices include `/srv/almond-cloud` and `/var/lib/almond-cloud`.

**Note**: If you skip this step, set `THINGENGINE_DISABLE_SANDBOX=1` in your environment.

### Step 3: Database

First set `DATABASE_URL` in your environment:

```sh
DATABASE_URL=mysql://user:password@host:port/database?options
```

Then set up your database by running
```sh
node ./scripts/execute-sql-file.js ./model/schema.sql
```

See the documentation of node-mysql for options. If you use Amazon RDS, you should say so with `ssl=Amazon%20RDS`.
It is recommended you set `timezone=Z` in the options (telling the database to store dates and times in UTC timezone).

After that, execute:
```sh
node ./scripts/bootstrap.js
```

This script will create the default `root` user, with password `rootroot`.

If you are using the embedded Thingpedia, the script will also populate the database with the builtin Thingpedia entries.

The script will also create a default `anonymous` user, with the same password as the root user. This enables users to try
Web Almond without creating an account for themselves. Note that the default anonymous user is missing
all service accounts, including those like YouTube that are advertised as suggestions to users.

You must set up those accounts before enabling the anonymous user in `config.js`. To do so, log in
to the anonymous user as if it was regular user, and add the accounts to My Almond.
It goes without saying, you should change the password for both the `root` and `anonymous` users, and you should use real, strong passwords.

### Step 4: Web Almond

Web Almond is composed of a master process, and a number of worker processes.
To start the master process, create a working directory, say `/srv/almond-cloud/workdir`, then do:

```sh
cd /srv/almond-cloud/workdir ; node <path-to-almond-cloud>/almond/master.js
```

**Do not** use a subdirectory of the code checkout for the Web Almond working directory,
as that can create a security vulnerability. 

The master process listens on the two sockets indicated in `config.js` as `THINGENGINE_MANAGER_ADDRESS`.
You can use a path in the configuration file, a port, or host name/IP address with a port name.
See [node-sockaddr](https://github.com/gcampax/node-sockaddr) for the full range of options supported.
If you use a TCP socket, you must set `THINGENGINE_MANAGER_AUTHENTICATION` as well, to prevent
users from connecting to it from inside the developer sandboxes.

To scale horizontally, you can run multiple master processes, by setting multiple values to
`THINGENGINE_MANAGER_ADDRESS` and passing `--shard <id>` to the master's commandline.

An example systemd unit file called `almond-cloud@.service` is provided. The unit file assumes
the repository is located at `/opt/almond-cloud` and the local state directory is `/srv/almond-cloud`.

### Step 5: the web frontend

First set the following variables in your environment:

```sh
SECRET_KEY=SECRET
```

`SECRET_KEY` is used to hash the session. Choose a secure secret to prevent session hijaking.

```sh
JWT_SECRET_KEY=JWT_SECRET
```

`JWT_SECRET_KEY` is used in the exchange of client authorization codes for OAuth access tokens.

```sh
AES_SECRET_KEY=AES_SECRET
```
`AES_SECRET_KEY` is used during Two Factor Authentication. This secret must be exactly 32 hex characters.

Then you can run the web frontend in the same working directory as the master process, by saying:

```
PORT=... node <path-to-almond-cloud>/frontend.js
```

If PORT is unspecified, it defaults to 8080. Multiple frontend web services can be run on different
ports, for load balancing. It is recommended to run at least two.
An example systemd unit file is provided, called `almond-website@.service`.

### Step 6 (optional): the NLP inference server

The NLP inference server must be run from a directory containing the trained models. The expected directory
layout is as follows:

```
/default:en/{best.pth, config.json, thingpedia.json}
/default:zh/{best.pth, config.json, thingpedia.json}
/default:.../{best.pth, config.json, thingpedia.json}
...
```

You can acquire the pretrained models for testing from <https://oval.cs.stanford.edu/releases/>,
our you can train your custom models using [Genie](https://github.com/stanford-oval/genie-toolkit).

You must also download the pretrained word embeddings, and set the `DECANLP_EMBEDDINGS` environment
variable to the location where you downloaded. See [tests/install-nlp-deps.sh](https://github.com/stanford-oval/almond-cloud/blob/master/tests/install-nlp-deps.sh)
for an example. 

To run the NLP inference server do:
```
PORT=... node <path-to-almond-cloud>/nlp/main.js
```

PORT defaults to 8400. You can run multiple NLP inference servers on the same machine, but it is not
recommended, as each server already makes use of all available cores, and multiple servers can easily
exhaust available RAM. It is also not recommended to run this on the same machine as the frontend and
and master processes.
An example systemd unit file is provided, called `almond-nlp.service`.

The NLP inference server needs access to the database for typechecking, dataset access and to store
any trained sentences. For security, it is recommended to use a different database user than the one used by
the master and frontend processes.

### Step 7 (optional): the NLP training server

You can automate training custom NLP models using the training server, which you can run as:

```
PORT=... node <path-to-almond-cloud>/training/daemon.js
```

The current directly must be writable to the user running the server, and must be on disk with
large amounts of space (at least 50 GBs free). The subdirectory `jobs` of the server current
directory will contain a new entry for each trained job, and it is recommended to clean it periodically,
for example with systemd-tmpfiles. 
An example systemd unit file is provided, called `almond-training.service`.

It is expected that the training server and the inference server run on different machines, and communicate
over `rsync`/`ssh`. You must configure the Unix user running the training server to have SSH access
to the inference server, and write access to the directory where the inference server is running. You can do
for example with the following SSH `authorized_keys` entry:
```
command="/usr/local/bin/rrsync -wo /var/lib/almond-cloud/nlp",restrict ssh-rsa AAAA...
```

