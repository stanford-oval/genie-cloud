# Using the Thingpedia Command Line Tools

The Thingpedia Command Line Tools offer a convenient and scriptable alternative
to developing Thingpedia devices. Using the CLI you can work in your favorite IDE,
test locally, then publish using your favorite CI integration.

[[toc]]

## Installation

The Thingpedia tools can be installed from the NPM registry:
```bash
yarn global add thingpedia-cli
```

The command is called `thingpedia` and should be in your path.

NOTE: this guide assumes that you're using the [yarn package manager](https://yarnpkg.com).
It is possible to use NPM instead, but for reliable results it is recommended to use yarn.

## Setup

To create a new project to develop Thingpedia devices, you can run:

```bash
thingpedia --developer-key <...> --access-token <...> \
  init-project my-awesome-devices
cd my-awesome-devices
yarn
```

This command will create a git repository called `my-awesome-devices`,
and initialize it with the build tools to package devices and upload
them to Thingpedia.

It will also install the developer dependencies: eslint, nyc (code coverage) and
the Thingpedia SDK. These dependencies should not be bundled in the
devices you upload to Thingpedia, but are used by the test and packaging
scafolld code.

The access token is optional, and is needed only if you wish to also upload
devices from the command line. You can retrieve an access token from
your [User Settings page](/user/profile), and you can change the token
later with:
```bash
git config thingpedia.access-token <...>
```

## Creating a new device

Inside a configured Thingpedia project, you can add a new device with:

```bash
thingpedia init-device com.foo
```

This will create a directory `com.foo` with a pre-populated package.json,
device.js, and manifest.tt files.

## Testing

Tests are specified in `tests/<device-id>.js`. See
[thingpedia-common-devices](https://github.com/stanford-oval/thingpedia-common-devices)
for examples on how to write tests.

Once you have tests, you can run them with
```bash
yarn test
```

You can also test a single device with:
```bash
yarn test com.foo
```

## Packaging and uploading

Once ready, you can package your device with:
```bash
yarn make com.foo.zip
```
(a bare `yarn make` invocation will package _all_ devices in a project).

While packaging the device, linting will automatically run, with our recommended configuration.
This will catch early errors, such as syntax errors or variable name typos, even
if you do not have unit tests yet. It will also ensure you do not use syntax features
that are not available in Almond.

You can also upload the device to Thingpedia with:

```bash
thingpedia upload-device \
  --zipfile com.foo.zip \
  --icon com.foo/icon.png \
  --manifest com.foo/manifest.tt \
  --dataset com.foo/dataset.tt
```

Like with the web UI, `--icon` and `--zipfile` are optional after the first
upload, if they did not change. The zip file should also be omitted if the device
uses the [Generic REST or RSS loaders](thingpedia-device-with-zero-code.md).

