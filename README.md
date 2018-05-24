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

The code depends on nodejs (>= 8.0), cvc4 (any version, although >= 1.5 is recommended),
gm (provided by GraphicsMagic), cairo.
Optionally, it depends on libsystemd for journal integration.
A working MySQL server is also required.

This repository uses yarn for dependency tracking.
You should install yarn from [its website](https://yarnpkg.com/en/docs/install), and then run:

```yarn install```

Note: due to strict version requirements between the different Almond components,
which are hosted as git repositories and not published on the npm registry, using
npm is not supported.

#### Setting up database encryption

If you want to encrypt your user's data at rest, you should configure your Web Almond to link against
[sqlcipher](https://www.zetetic.net/sqlcipher) instead of sqlite. To do so, place this in `.yarnrc` in your home directory or in the root
directory of `thingengine-platform-cloud`:

```
build_from_source true
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

In `config.js`, you must also set the redirect URI origin (scheme-host-port) for your OAuth redirects.
This is to support Login With Google, and to support configuring OAuth-based accounts in Web Almond.
This must be the same origin that you will configure for OAuth redirect URLs.

If you use the embedded Thingpedia, it is expected you use a CDN to deliver code zip files, icons and other large user generated
content. Set the URL of your CDN in `config.js`. You can also set the URL of a subfolder of your
Thingpedia web server if you don't wish to use a CDN.

If you do not set up a CDN, zip files and icons will be stored in the public/download folder of your code checkout.

In `config.js`, you can also change the URL of the natural language service to use. This
is necessary if you use an embedded Thingpedia (as the default one refers to the public Thingpedia).

### Step 2.5 (optional): Build the sandbox

If you plan to deploy this as a web facing service, and you plan to allow developer users, you
will want to set up the sandbox. Use:

```make -C sandbox localstatedir=/var/lib/thingengine```

Replace `/var/lib/thingengine` with the directory under which the user sandboxes will be placed.
This directory must be readable and writable to the user running the Web Almond processes.

If you skip this step, set `THINGENGINE_DISABLE_SANDBOX=1` in your environment.

### Step 3: Database

Set up your database by executing the SQL in `model/schema.sql`. Then set `DATABASE_URL` in your environment:

```DATABASE_URL=mysql://user:password@host:port/database?options```

See the documentation of node-mysql for options. If you use Amazon RDS, you should say so with `ssl=Amazon%20RDS`.
It is recommended you set `timezone=Z` in the options (telling the database to store dates and times in UTC timezone).

The SQL script will create a default root user, with password `rootroot`.
The database is initially empty.

If you are using the embedded Thingpedia, you must populate it with the builtin Thingpedia entries
([org.thingpedia.builtin.thingengine](https://almond.stanford.edu/thingpedia/devices/by-id/org.thingpedia.builtin.thingengine), [org.thingpedia.builtin.thingengine.builtin](https://almond.stanford.edu/thingpedia/devices/by-id/org.thingpedia.builtin.thingengine.builtin),
 [org.thingpedia.builtin.thingengine.remote](https://almond.stanford.edu/thingpedia/devices/by-id/org.thingpedia.builtin.thingengine.remote),
 [org.thingpedia.builtin.test](https://almond.stanford.edu/thingpedia/devices/by-id/org.thingpedia.builtin.test))
 before you can run Web Almond.

### Step 4: Web Almond

Web Almond is composed of a master process, and a number of worker processes.
To start the master process, do:

```node ./almond/master.js```

The master process listens on the two sockets indicated in `config.js`. You can use a path
in the configuration file, a port, or host name/IP address with a port name.
See [node-sockaddr](https://github.com/gcampax/node-sockaddr) for the full range of options supported.

A systemd unit file called `thingengine-cloud.service` is provided. The unit file assumes
the repository is located at `/opt/thingengine` and the local state directory is `/srv/thingengine`.

### Step 5: the web frontend

Finally, you can run the web frontend, by saying:

```node ./main.js```

Again, a systemd unit file is provided, called `thingengine-website.service`.
