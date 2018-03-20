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

**NOTE:** you normally don't install Thingpedia. Instead, you should rely on the publicly
available instance at <https://thingpedia.stanford.edu>.

### Step 1: Acquiring dependencies

The code depends on nodejs (>= 6.10), cvc4 (any version, although >= 1.5 is recommended).
Optionally, it depends on libsystemd for journal integration.
A working MySQL server is also required.

This repository uses yarn for dependency tracking.
You should install yarn from [its website](https://yarnpkg.com/en/docs/install), and then run:

```yarn install```

Note: due to strict version requirements between the different Almond components,
which are hosted as git repositories and not published on the npm registry, using
npm is not supported.

### Step 1.5: Build the sandbox

If you plan to deploy this as a web facing service, and you plan to allow developer users, you
will want to set up the sandbox. Use:

```make -C sandbox localstatedir=/var/lib/thingengine```

Replace `/var/lib/thingengine` with the directory under which the user sandboxes will be placed.
This directory must be readable and writable to the user running the Web Almond processes.

If you skip this step, set `THINGENGINE_DISABLE_SANDBOX=1` in your environment.

### Step 2: Database

Set up your database by executing the SQL in `model/schema.sql`. Then set `DATABASE_URL` in your environment:

```DATABASE_URL=mysql://user:password@host:port/database?options```

See the documentation of node-mysql for options. If you use Amazon RDS, you should say so with `ssl=Amazon%20RDS`

The SQL script will create a default root user, with password `rootroot`.
The database is initially empty, and must be populated with the builtin Thingpedia entries.

### Step 3: Configuration

Thingpedia assumes you use a CDN to deliver code zip files, icons and other large user generated
content. Set the URL of your CDN in `config.js`. You can also set the URL of a subfolder of your
Thingpedia web server if you don't wish to use a CDN.

Additionally, modify `platform.js` and `almond/platform.js`, replacing `https://thingengine.stanford.edu`
with the host on which you will run your Thingpedia. This must be the same host that you will
configure for OAuth redirect URLs.

### Step 3: Web Almond

Web Almond is composed of a master process, and a number of worker processes.
To start the master process, do:

```node ./almond/master.js```

The master process listens on the two sockets indicated in `config.js`. You can use a path
in the configuration file or a port.

A systemd unit file called `thingengine-cloud.service` is provided. The unit file assumes
the repository is located at `/opt/thingengine` and the local state directory is `/srv/thingengine`.

### Step 4: the web frontend

Finally, you can run the web frontend, by saying:

```node ./main.js```

Again, a systemd unit file is provided, called `thingengine-website.service`.
