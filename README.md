# Thingpedia & Web Almond

## Knowledge for your Virtual Assistant

This repository contains Thingpedia, the open, crowdsourced knowledge base for the Almond
virtual assistant.
It also contains Web Almond, a cloud service to provide Almond through a web interface.

The production branch of this repository is deployed at <https://almond.stanford.edu>

Thingpedia is part of Almond, a research project led by
prof. Monica Lam, from Stanford University.  You can find more
information at <https://almond.stanford.edu>.

## Installation

### Step 1: Acquiring dependencies

The code depends on:

- nodejs (>= 8.0)
- cvc4 (any version, although >= 1.5 is recommended; only the binary is needed, not the library)
- gm (provided by GraphicsMagic)
- cairo
- Pango
- giflib
- libjpeg
- libcap

Optionally, it depends on:

- libsystemd
- bubblewrap

These dependencies are used for sandboxing and journal integration.

A working MySQL server is also required. We recommend MariaDB >= 10.2 for best compatibility.

For example, on Ubuntu (>= 18.04):
```
sudo apt install nodejs cvc4 graphicsmagick libcairo2-dev libpango1.0-dev libgif-dev libjpeg-dev libcap-dev libsystemd-dev bubblewrap -y
```
On Fedora:
```
sudo dnf install nodejs cvc4 GraphicsMagick cairo-devel pango-devel giflib-devel libjpeg libcap-devel libsystemd-devel bubblewrap -y
```


If you would like to run the MySQL server locally:
```
sudo apt install mariadb-server //Ubuntu
sudo dnf install mariadb-server //Fedora
```

This repository uses yarn for dependency tracking.
You should install yarn from [its website](https://yarnpkg.com/en/docs/install).
Then place the following `.yarnrc` in your home directory or in the root directory of `almond-cloud`:
```
build_from_source true
```

And then run:

```
yarn install
```

Note: due to strict version requirements between the different Almond components, using
npm is not supported.

#### Setting up database encryption

If you want to encrypt your user's data at rest, you should configure your Web Almond to link against
[sqlcipher](https://www.zetetic.net/sqlcipher) instead of sqlite. To do so, place this in your `.yarnrc`:

```
sqlite "/opt/sqlcipher"
sqlite_libname sqlcipher
```

Replace `/opt/sqlcipher` with the actual installation directory of sqlcipher.

Database encryption uses a randomly generated key that is different from each user.

### Step 2: Configuration

Web Almond can operate in two modes: using the embedded Thingpedia, or referring to a publicly
available Thingpedia.

**NOTE:** using the embedded Thingpedia is not recommended. Instead, you should rely on the publicly
available instance at <https://thingpedia.stanford.edu>.

You must choose which mode to operate as by editing the `config.js` file. If you don't want to
edit the file in git, you can also create a file called `secret_config.js`, in the same folder,
where you can override any configuration. The format of `config.js` and `secret_config.js` is
the same.

**NOTE**: despite the name, values in `secret_config.js` are not secret (they are accessible
inside the individual user sandboxes). Use environment variables if you need true secret tokens,
and store them in a root-only (0600) file.

In `config.js`, you will also want to change the `SERVER_ORIGIN` field to point to the correct
location (scheme-host-port) of the server.
If `ENABLE_REDIRECT` is true, any request with a hostname or scheme that is not that of `SERVER_ORIGIN` will
be redirected to the correct origin. This is support seamless migration between domains, and
transparent upgrade to HTTPS.

Once you have set up TLS, you should also set `ENABLE_SECURITY_HEADERS` to true, which will enable
Strict Transport Security, X-Frame-Options and other important security-related HTTP headers.

You can customize the website, by overriding the content of the index and about pages to use different
pug files, using `ABOUT_OVERRIDE`. If you plan to serve Web Almond to users and allow registration,
at the minimum you must override the terms of service page and the privacy policy page, as they
are empty in the default installation. See `stanford/config.js` and `views/stanford` for examples
of how to do so.

If needed, you can also change `OAUTH_REDIRECT_ORIGIN` to set the origin for your OAuth redirects.
The latter is used to support Login With Google, and to configure OAuth-based accounts in Web Almond,
so it must be the same origin that you will configure for OAuth redirect URLs.

If you use the embedded Thingpedia, it is expected you use a CDN to deliver code zip files, icons and other large user generated
content. Set the URL of your CDN in `config.js`. You can also set the URL of a subfolder of your
Thingpedia web server if you don't wish to use a CDN.

If you do not set up a CDN, zip files and icons will be stored in the public/download folder of your code checkout.

In `config.js`, you can also change the URL of the natural language service to use. This
is necessary if you use an embedded Thingpedia (as the default one refers to the public Thingpedia).

### Step 2.5 (optional): Enable the sandbox

If you plan to deploy this as a web facing service, and you plan to allow developer users, you
will want to set up the sandbox.

Inside the sandbox, the code will have access to `/usr`, a whitelisted subset of `/etc`, and the
directory containing the Web Almond installation. Make sure that these directories do not contain
any private data.

In particular, you must make sure that the current working directory for Web Almond
processes is not under `/usr`, `/etc`, or in the subtree where you cloned Web Almond.
Common correct choices include `/srv/thingengine` and `/var/lib/thingengine`.

If you skip this step, set `THINGENGINE_DISABLE_SANDBOX=1` in your environment.

### Step 3: Database

Set up your database by executing the SQL in `model/schema.sql`. Then set `DATABASE_URL` in your environment:

```sh
DATABASE_URL=mysql://user:password@host:port/database?options
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
To start the master process, do:

```sh
node ./almond/master.js
```

The master process listens on the two sockets indicated in `config.js`. You can use a path
in the configuration file, a port, or host name/IP address with a port name.
See [node-sockaddr](https://github.com/gcampax/node-sockaddr) for the full range of options supported.

A systemd unit file called `thingengine-cloud.service` is provided. The unit file assumes
the repository is located at `/opt/thingengine` and the local state directory is `/srv/thingengine`.

### Step 5: the web frontend

Finally, you can run the web frontend, by saying:

```
node ./main.js
```

Again, a systemd unit file is provided, called `thingengine-website.service`.
