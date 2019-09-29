# Testing Thingpedia devices

So you have uploaded your first device to Thingpedia. And of course, your code is perfect
on the first try, and does not need any testing. But what do _other_ developers do for testing?

[[toc]]

## Unit Testing

To speed up development, and avoid cycles of upload-to-Thingpedia, test, find bug, fix, it is
recommended to write unit tests, and run them in your developer environment.

If you use the [Thingpedia Command Line Tools](thingpedia-cli-tools.md), a skeleton environment
to load your device is provided, and you can run unit tests with `yarn test`. Otherwise,
you can use the [Thingpedia SDK](https://github.com/stanford-oval/thingpedia-api) to load
the device in with a mock Almond and test.

Because APIs change unpredictably, it is recommended to run unit tests periodically, for example
using a Continuous Integration solution. Almond's developers personally recommend [Travis](https://travis-ci.com),
which is free for open-source and educational projects, but any CI should be suitable.

## Integration Testing in Web Almond

After uploading to Thingpedia, the device can be immediately tested in your Web Almond account.

You can test the functionality of your device, including the confirmation and slot-filling prompts,
by typing ThingTalk commands preceded by `\t`.
For example, to test the `get` command for The Cat API, 
you can write: `\t now => @com.thecatapi.get(count=3) => notify;`. 
Please refer to [ThingTalk by Examples](/doc/thingtalk-intro.md) for more details about how to write a command in ThingTalk.

Other members of your Thingpedia organization can also test the device, but they do not automatically
switch to the latest version of a device when you upload it. Manual update of the version used
for testing is possible from the [Almond Status Page](/me/status).

### Testing Natural Language

To test the natural interface to your Thingpedia device, you must wait for the natural language model
to update. During the update, the device details page will include a message indicating that natural
language support will be incomplete.

Within about five minutes of an update, a baseline model will be available, which understands exactly
the sentences included in the `dataset.tt` file. Actions can be used as-is, query commands need a "get" in front
(e.g. "get a cat picture" maps to a dataset example with utterance "a cat picture"), and stream commands
must be prefixed with "notify me when".

If you want to train the full model, click on the `Start Training` button at the bottom 
of the details page of your device to start a new training job. The training will take up to 27 hours,
and you can see the progress at the top of the details page for your device. 
The training is complete when the blue banner disappears.

Because training is computationally expensive, please only train the full model if you
are confident of your API design and of your implementation.

## Local Testing

If your device makes use of local connectivity or Bluetooth, testing in Web Almond is not possible.
In that case, you should use one of the [local versions of Almond](/about/get-almond).

During development, we recommend using [Command Line Almond](https://github.com/stanford-oval/almond-cmdline),
which can be installed from the NPM registry with:
```
yarn global add almond-cmdline
```
The command is called `almond`. Please refer to the `yarn` documentation if you encounter
a "command not found" error.

Command Line Almond supports a developer mode, which can be activated by entering the following
commands at the Almond prompt:

```
\= developer-key "<your Thingpedia developer key>"
\= developer-dir "<absolute path to a directory containing your Thingpedia devices>"
```

While in developer mode, Almond will load your local copy of the code instead of the Thingpedia copy,
allowing to edit and debug without uploading to Thingpedia.
Please refer to the [Command Line Almond documentation](https://github.com/stanford-oval/almond-cmdline/blob/master/README.md) for further details.

Other versions of Almond also support a limited developer mode, which enables you
to test the latest version of a device in Thingpedia before it is approved. Please
refer to their documentations for details.
