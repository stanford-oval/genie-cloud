# Writing Interfaces for Thingpedia

## Getting Started

### The basics: Devices, Channels, and Events

At the highest level, a Thingpedia interface is just a nodejs
package, whose main entry point is a _device class_.

From a device class, the system will obtain _device instances_,
which are the individual objects that represent things in
the system (we use "device" as a term in the code to mean both
physical devices and web services). A device instance contains
all the descriptors that are needed to identify the thing,
such as account ID or IP/MAC address, and contains any authentication
information.

From each device instance, when needed the system will obtain
_channels_. A channel is an abstraction over a trigger (a standing query),
a query (instantenous) or an action, which is represented as an open connection
to the device.

A channel produces and handles _events_. These are just JS arrays of values
that are processed by the ThingTalk rules. A trigger channel will
produce new events to be handled by the rules, based on the data
obtained by the device. An action channel will consume an event
produced by a rule and turn into in an external action. A query channel
will consume a partially filled event representing a pattern to
match, and will produce a list of events matching that pattern.

Channels can be opened and closed. For triggers, an open channel
is one that generates events, and a closed channel does not.
For actions, you can assume that invocations will only happen on
open channels, so you can release any resource during close.

You should never need to open or instantiate channels yourself.
Instead, you would set up your _channel class_ so that the system
will create and open the channels at the right time.

### Become a developer

At the moment, Thingpedia is still in closed beta. But you can request a
developer account from
[here](https://thingpedia.stanford.edu/user/request-developer).
Once you are approved by the Thingpedia administrators
(you can check your status
from [your profile page](https://thingpedia.stanford.edu/user/profile)),
you will be able to upload your own devices or accounts to Thingpedia and
enable users to use it through Almond.

### Looking for examples?

Go to our [Github repository](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices)
to see the device packages we developed, and observe these concepts
in action. In addition, you can download the source code of any existing
"supported interfaces" in
[Developer Portal](https://thingpedia.stanford.edu/thingpedia/devices).

## Writing Device Package

### The layout of a Device package

The Thingpedia API assumes a precise layout for a device package, which
must be a zip file containing exactly the JS files and the package.json,
as well as any dependency you need. You should not assume any nodejs
module beyond the 'thingpedia' module illustrated here - if you need any,
bundle them in your zip file. The JS version you should target is ES5,
but you can assume runtime services for ES6 (provided by babel-polyfill, preloaded),
and you are encouraged to use babel to compile from ES6 to ES5.

For the package.json file, don't wrory about the additional attributes
_thingpedia-metadata_ and _thinepedia-version_ which appear in examples we
provided. They will be generated automatically when you upload your code to
Thingpedia with proper device metadata which we will introduce later.

The primary entry point (i.e., the one named as "main" in package.json)
should be a _device class_. You would instantiate the device class
from the API and set it directly to `module.exports`, as in

```javascript
    const Tp = require('thingpedia');

    module.exports = new Tp.DeviceClass({
        Name: "MyDeviceClass",

        _init: function(engine, state) {
             this.parent(engine, state);
             // constructor
        }

        // other methods of device class
    });
```

Then, for each trigger or action you want to expose, you would
have a separate JS file for each, named after the trigger or action,
exposing the channel class as `module.exports`. So for example, if
you want to expose action `frobnicate()`, you would put the following
in a file named `frobnicate.js` at the toplevel of your device package:

```javascript
    const Tp = require('thingpedia');

    module.exports = new Tp.ChannelClass({
        Name: "FrobnicateChannel",

        _init: function(engine, device) {
            this.parent();
            // constructor
        }

        // other methods of channel class
    });
```

Note: the `Name` you specify in the device and channel class is just
a debugging hint (your object will stringify to `[object YourName]`),
it has no real significance.

### A closer look to the Device class

#### The BaseDevice API

When you create a device class with `new Tp.DeviceClass`, you're actually
declaring a subclass of [`Tp.BaseDevice`](https://github.com/Stanford-IoT-Lab/thingpedia-api/blob/master/lib/base_device.js),
the base class of all device classes.

By convention, members starting with a capital letter here are static, and
members stating with lower case are instance methods and variables.
`Tp.BaseDevice` has you the following API:

- `this.kind`: The name of your nodejs package, and the unique identifier of
your device class that will use to publish your device to Thingpedia.
- `this.state`: An arbitrary serializable JS object with data you will need to
talk to the device - including IP address, OAuth tokens, variable portions
of API urls, etc.  
- `this.uniqueId`: A string that uniquely identifies the device instance in the
context of a given ThingSystem; you are supposed to compute it based on the
state and set it at the end of your constructor.
A common way to compute an unique ID is to concatenate the kind, a dash, and
then some device specific ID, as in `org.thingpedia.demos.thingtv-AA-BB-CC-DD-EE-FF` if `AA:BB:CC:DD:EE:FF`
is the MAC address of the ThingTV.
- `this.engine`: Gives you access to the full Engine API, which will be
introduced below.
- `this.stateChanged()`: If you change `this.state`, you must at some point call `this.stateChanged`
to preserve the modification to disk.
- `this.updateState(newState)`: Conversely, if the state changes outside of you, and you
want to recompute state, you should override `updateState()` to handle the new state; the overriding
method should chain up (with `this.parent(newState)`) as the first statement
- `this.start()`, `this.stop()`: called when the engine starts and stops respectively, you can
override them to run any async initialization for your device, by returning a promise that is
resolved when your device is ready
- `this.queryInterface(iface)`: request an _extension interface_ for this device instance; extension
interfaces are optional features that your device class supports; override this method if you have
any, otherwise the default implementation will always return `null`.
The most important extension
interface is `subdevices`. If you implement it (i.e., you return anything that
is not `null`), your device is assumed to be a collection of related devices
(like a Nest Account or a Philips Hue bridge).
You must return an instance of
[`ObjectSet`](https://github.com/Stanford-IoT-Lab/thingpedia-api/blob/master/lib/object_set.js),
containing the devices related to yours. You are responsible for calling `objectAdded`
and `objectRemoved` if related devices can appear and disappear dynamically.
- `UseOAuth2`: if your device can be instantiated with an OAuth-like flow (user clicks on a button,
is redirected to a login page), this should be set to the handler; despite the name, this is
called also for OAuth 1
- `UseDiscovery`, `this.updateFromDiscovery`: discovery operations, described later

#### The Engine API

`this.engine` on a device gives you access to the
[`Engine`](https://github.com/Stanford-IoT-Lab/thingengine-core/blob/master/lib/engine.js)
object, which is shared among all device instances. The API on the
`Engine` object is less stable than `Tp.BaseDevice`, but it is
nevertheless useful.

- `engine.ownTier`: the currently running tier of ThingSystem, ie `cloud` or `phone`
- `engine.devices`: the devices database
- `engine.platform`: the Platform API
- `engine.thingpedia`: APIs to query the Thingpedia website

#### The Platform API

Anywhere in ThingSystem code you will be able to access the Platform API through the `engine.platform`
property.

Most of the API is for internal use only, but you might find the following useful:

- `platform.hasCapability()`, `platform.getCapability()`: access
  platform specific APIs and capabilities, such as bluetooth,
  unzipping, showing popups or interacting with the assistant
- `platform.getSharedPreferences()`: access an instance of
[`Preferences`](https://github.com/Stanford-IoT-Lab/thingengine-core/blob/master/lib/prefs.js),
which is a ThingSystem wide store of key-value pairs backed to disk
- `platform.getRoot()`, `platform.getWritableDir()`,
`platform.getCacheDir()`, `platform.getTmpDir()`: the paths that
ThingSystem can use on the file system
- `platform.getDeveloperKey()`: the currently configured Thingpedia developer key (if any)
- `platform.getOrigin()`: the web site hosting ThingSystem; use this for OAuth redirect URIs

#### Handling authentication and discovery

Most devices will require some kind of authentication, three ways to do
authentication are supported, including `basic` (traditional username and
password), `oauth2` (OAuth 1.0 and 2.0 style authentication), and `discovery`
(authentication by discovery and local interactive paring). Here's a
[complete guide for authentication and discovery](/thingpedia/developers/thingpedia-device-intro-auth-n-discovery.md).  

### Channel classes

Great, so now you filled up your device class, and the user can add the device from
the UI. Time to make some triggers, actions and queries.

As mentioned, triggers, actions and queries need channel classes, of the form:

```javascript
    const Tp = require('thingpedia');

    module.exports = new Tp.ChannelClass({
        Name: 'MyChannel',
        RequiredCapabilities: [],

        _init: function(engine, device, params) {
        },

        _doOpen: function() {
            // open the channel
        },

        _doClose: function() {
            // close the channel
        }
    });
```

`_doOpen` and `_doClose` should return a promise (or, strictly speaking, a thenable)
that is ready when your channel is. If you return undefined (or don't override them), it is assumed you completed
your initialization and deinitialization synchronously.

`RequiredCapabilities` is an array of platform capabilities that your channel requires
to work. If the platform does not have the capabilities you need, then your channel will
not be instantiated (and the engine will try to figure out a different way to run it,
for example through a proxy), so you don't have to check for them.

#### Triggers

Triggers should call `this.emitEvent([a,b,c])` whenever they want to generate an event.
For example:

```javascript
    const Tp = require('thingpedia');

    module.exports = new Tp.ChannelClass({
        Name: 'MyTrigger',

        _init: function(engine, device, params) {
            this.parent();
            this.timeout = null;
        },

        _doOpen: function() {
             this.timeout = setTimeout(function() { this.emitEvent(['bla']); }.bind(this), 5000);
        },

        _doClose: function() {
             clearTimeout(this.timeout);
             this.timeout = 1000;
        }
    });
```

When the values generated by the triggers are measurements, you must make use of
the base units defined in the [ThingTalk reference](/doc/thingtalk-reference.md).

#### Actions

Actions on the other hand should override `sendEvent(event)` in the
channel class, as in:

```javascript
    const Tp = require('thingpedia');

    module.exports = new Tp.ChannelClass({
        Name: 'MyAction',

        _init: function(engine, device, params) {
            this.parent();
        },

        sendEvent: function(event) {
            // do something
        },
    });
```

#### Queries

Queries should override `invokeQuery(filters)` in the channel class, and
return an promise to a list of events, as in:

```javascript
    const Tp = require('thingpedia');

    module.exports = new Tp.ChannelClass({
        Name: 'MyAction',

        _init: function(engine, device, params) {
            this.parent();
        },

        invokeQuery: function(filters) {
            return makeServiceCall(filters).then(function(results) {
                return results.map(function(result) {
                    return [result.foo, result.bar];
                });
            });
        },
    });
```

#### Partially applied triggers

It is possible that web services will support server side filtering of
event streams, which can reduce the number of wake ups required on
ThingSystem if the rule is also going to filter out the data.

To address some of those cases, rules that invoke a trigger with a
constant value will see those values propagated to the params argument
to the constructor. Parameters that are unspecified in a rule will
be set to `undefined` or `null` (you should check for both).

If you make any use of that `params` argument, you should set
`this.filterString` in your constructor to a stringified version of
the parameters that you care about. This is needed to properly deduplicate
your channel across rules with different filter values.

#### Stateful Channels

Often times, you will want to preserve state between different invocations
of your channel. Keeping it in memory is not enough though, because the
ThingSystem might be restarted at any time and the state would be lost.

Instead, you can require the `channel-state` capability (with `RequiredCapabilities: ['channel-state']`). If you do, the signature of your constructor becomes

```javascript
    _init: function(engine, state, device, params)
```

The `state` object is persisted to disk, and has APIs:

- `state.get(key)`: return a state value
- `state.set(key, value)`: modify a state value

### Writing Triggers

So far we've looked at the most generic of all triggers, suitable for any kind
of service API. But most triggers will make use of periodic polling, and for
those simpler code is possible.

#### Polling Trigger

```javascript
    const Tp = require('thingpedia');

    module.exports = new Tp.ChannelClass({
        Name: 'MyPollingTrigger',
        Extends: Tp.PollingTrigger

        _init: function(engine, device, params) {
            this.parent();
            this.interval = 3600000; // in milliseconds
        },

        _onTick: function() {
            // do something
        },
    });
```

If you use `Tp.PollingTrigger` and you set the interval in the constructor
(or alternatively in the class definition, if it's a constant), then you
only need to override `_onTick`, which will be called periodically.

#### HTTP Polling Trigger

An even more common case is that of a periodic HTTP poll. In that case, you can
use `Tp.HttpPollingTrigger`:

```javascript
    const Tp = require('thingpedia');

    module.exports = new Tp.ChannelClass({
        Name: 'MyPollingTrigger',
        Extends: Tp.HttpPollingTrigger

        _init: function(engine, device, params) {
            this.parent();
            this.interval = 3600000;
            this.url = 'https://api.example.com/1.0/poll';
            this.auth = 'Bearer ' + device.accessToken;
        },

        _onResponse: function(data) {
            // do something
        },
    });
```

The `_onResponse` method of your channel class will be called with the
buffered HTTP response body, if the status is 200. 301 and 302
statuses are followed transparently, other statuses will log an error
and not call your method.

Use `this.auth` to set the content of the `Authorization` header (or
set it to `null` if you don't want one).

#### HTTP Helpers

The HTTP polling trigger makes use of the more general `Tp.Helpers.Http`.
These are wrappers for nodejs [http API](https://nodejs.org/api/http.html)
with a Promise interface.

The available APIs are:

- `Http.get(url, options)`: Perform a buffered HTTP GET; `options` can contain `auth`
(`Authorization` header) and `accept` (`Accept` header); if `options.raw` is set,
returns a promise of the response body as a Buffer and the `Content-Type` header
as a String; otherwise, just a promise of the response body as a String
- `Http.post(url, data, options)`: Perform a buffer HTTP POST; `data` is a
Buffer or String; `options` is the same as `Http.get` plus `dataContentType`,
the `Content-Type` of the posted data
- `Http.getStream(url, options)`: Perform a streaming HTTP GET; returns a promise
of a [readable stream](https://nodejs.org/api/stream.html)
- `Http.postStream(url, data, options)`: Perform a streaming HTTP POST; `data` should
be a readable stream and will be piped.

#### Formatting data

While actions only consume data, triggers and queries produce data that
might be of direct interest to the user (instead of being piped to an action or
another query).

If that's the case of your channel, you should implement the `formatEvent(event, filters)`
method on your channel class.

The return value can be a single, user visible string, which will be sent as a
single Almond message, or it can be an array of messages.

Each message can be a string, a Picture or an RDL. Pictures are represented as
objects of the form `{type: "picture", url: "..."}`. RDL (Rich Deep Link) are links
with title and description, and they are represented as

```javascript
    {
      type: "rdl",
      callback: "omlet url",
      webCallback: "browser url",
      displayTitle: "...",
      displayText: "..."
    }
```


## Device Metadata

In addition to a device package, each device specification published on
Thingpedia must include some metadata, called a _device manifest_, which will parsed
by Thingpedia to generate the web UI, and by Almond to talk to the user.

The manifest contains:

- The list of types the device claims to conform to
- The triggers and actions, their arguments, the documentation for each and the natural
  language metadata
- The authentication method, and any parameter that needs to be configured manually by
  the user (such as IP address or username)

The manifest is written in JSON, and looks like this

```javascript
    {
      "params": {
        "p1": ["P1 Label", "text"],
        "p2": ["P2 Label", "password"]
      },
      "types": ["t1", "t2"],
      "child_types": ["t3", "t4"]
      "auth": {
        "type": "none"
      },
      "triggers": {
        "trigger1": {
            "args": [{
        	"name": "a_string",
        	"type": "String",
        	"required": false,
        	"question": "What astring are you interested in?",
        	}, {
        	"name": "a_number",
        	"type": "Number",
        	"required": true,
        	"question": "What's the value of the first number?",
        	}, {
        	"name": "another_number",
        	"type": "Number",
        	"required": false,
        	"question": ""
        	}],
            "doc": "produces a string and two numbers",
            "canonical": "trigger first",
            "confirmation": "something happens",
            "examples": [
            	"monitor if something happens with $a_number",
            	"notify me if something happens with $a_number and astring is $a_string"
            ]
        }
      },
      "actions": {
        "action1": {
            "args": [{
        	"name": "a_feed",
        	"type": "Feed",
        	"question": "Who do you want to send the message to?",
        	}, {
        	"name": "a_message",
        	"type": "String",
        	"question": "What do you want to say in the message?",
        	}],
            "doc": "sends a message",
            "canonical": "send message",
            "confirmation": "send message to $a_feed saying $a_message",
            "examples": [
            	"message $a_feed saying $a_message"
            ]
        }
      }
    }
```

### Global name

The global name is the user visible name of the interface in the natural
language. Eg, if your name is "foo", the user will say "configure foo" or
"send message on foo". It's a good idea to give the device the global
name, but as the label suggests it needs to be global (so it should be
a brand name, eg "hue" or "twitter"). If you don't specify a global name,
the user will only interact with the device through one of the exposed
types.

### Types

The `types` array lists all the types that this device claims to conform
to, eg. `thermostat` or `speaker`. If you list your device as having a
certain type, you inherit the natural language annotations of that type.
The most important type is `online-account`, which will flag the device
as an account, and will change where it appears in the UI.
Of a similar spirit is the kind `data-source`, which will flag the device as a
public web service with no authentication, and will hide it from the Android UI
or from the 'list devices' Almond command.
Other important types are cloud-only and phone-only, which will prevent your
code from being instantiated outside of the right ThingSystem installation.
Use them if you need platform specific APIs.
Apart from previously mentioned types, each device _must_ has at least one
type from the following seven types: `media`, `social-network`, `home`,
`communication`, `health`, `service`, and `data-management`. These types
are used for categorizing devices. A device without these types will not be
shown in the device list when users use `help` in Almond.  

`child_types` is similar, but marks your device as a collection device,
and informs the system of the types that your child devices will expose.
If the user says "configure thermostat" and your device lists `thermostat`
as a child type, he will be offered to configure your device among the
many possibilities.

### Authorization

The combination of `params` and `auth.type` determines the UI to configure
the device. Valid types for `auth.type` are:

- `"none"`, in which case the UI will show a form if there is any parameter,
or a button otherwise
- `"oauth2"`, in which case the UI will always show a button
- `"basic"`, in which case the UI will always show a form; `username` and `password`
  parameters are required

### Channels

If you give your device a global name, worth noting are the natural language
annotations that you need to provide for each trigger, action or query:

#### Arguments
A list of arguments of the channel. To take full adventage of the 
functionality we provided in ThingTalk (filtering, chaining, etc.),  
everything needed for ___both input and output___ should be listed here. 
Each of the argument includes the following attributes.  
- `name`: the name of the argument, which we suggest to name with lower case 
  letters with underscores between each word.  
- `type`: the type of the argument inluding: String, Number, Boolean, Enum,
  PhoneNumber, EmailAddress, Location, Measure, Date, Time, Picture. 
- `required`, `question`: these annotations are
  related to slot filling; if your argument is required, the user will be asked
  `question` to fill the slot. Arguments for actions are always required, so
  the `required` property is ignored.

#### canonical
The canonical form of the channel name, used by the semantic parser;
it's a good idea to omit stop words for this, and to use a longer expression
such as `set target temperature on thermostat`.

#### confirmation
A string used to construct the final confirmation question
before a rule is created or an action is invoked; use the imperative form,
and refer to required arguments with `$argname`. For triggers, the full formula of the confirmation
is "Ok so you want me to notify if `<trigger confirmation>`". For queries,
you should use the command form, eg "get something" or "list something".

#### examples
A list of examples using your channel; this provides both documentation
for the user (they will be provided by `help <global-name>`)
and training data for the system; only one randomly chosed example will be be shown
in help if there are multiple paraphrases for the same functionality, but
every example will help Almond to understand users command better,    
so you should strive to provide as many examples and as many paraphrases
as possible; the same with confirmation, argument can be referred
with `$argname`.

If you don't give your device a global name, the natural language annotations
are ignored, and you will inherit those of the generic type.


## Publishing and Testing on Thingpedia

Once you are ready to let other people try your device interface, after thorough
local testing, you can publish it on Thingpedia.

To do so, you must first
[request a developer account](https://thingpedia.stanford.edu/user/request-developer).
Once the request is approved by the Thingpedia administrators (you can check the status
from [your profile page](https://thingpedia.stanford.edu/user/profile)), you will be
able to upload a new device by clicking on
[Propose it for inclusion](https://thingpedia.stanford.edu/thingpedia/upload/create?class=physical)
in the red banner in the Thingpedia page.

In the creation page you will be required to upload a zip file containing your
device package. The package.json must be at the toplevel of the zip file, not in a
subdirectory. You should always tick "This device requires additional JS code"
or your package will be ignored!

Each device package must contain all its dependencies, except for the `thingpedia`
module which is always provided. This also includes any promise library you might want
to use for channel classes.

Once submitted, the device is not automatically available to all users. Instead,
it is only available to you with your _developer key_, which you can retrieve
from your [user profile](https://thingpedia.stanford.edu/user/profile)
if you have already been approved to be a developer.
You should be able to test your device right away using the [Web Almond](/me/conversation) interface.
While if you want to test on Android Almond (which runs ThingSystem on your own
Android device with better privacy and discovery capability), you need one
more step: go to settings and enable cloud sync.

The device will become available after being reviewed and approved by a
Thingpedia administrator.
