# Writing Interfaces for Thingpedia

---

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
_channels_. A channel is an abstraction over
a query or an action, which is represented as an open connection
to the device.

A channel produces and handles _events_. These are just JS arrays of values
that are processed by the ThingTalk rules. 
An action channel will consume an event
produced by a rule and turn into in an external action. A query channel
will consume a partially filled event representing a pattern to
match, and will produce a list of events matching that pattern.
A query can also be _monitored_ to create a trigger (a standing query), 
which will produce new events based on new data obtained from the query channel.
You should never need to open or instantiate channels yourself.
Instead, the system will create and open the channels at the right time.

### Become a developer

At the moment, Thingpedia is still in closed beta. But you can request a
developer account from
[here](https://thingpedia.stanford.edu/user/request-developer).
Once you are approved by the Thingpedia administrators
(you can check your status
from [your profile page](https://thingpedia.stanford.edu/user/profile)),
you will be able to upload your own devices or services to Thingpedia and
enable users to use it through Almond.

### Looking for examples?
You can download the source code of any existing "supported interfaces" from
[Thingpedia](https://thingpedia.stanford.edu/thingpedia/devices).
In addition, you can go to our [Github repository](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices)
to see the device packages we developed, and observe these concepts
in action. 
Note that some of the packages are no longer supported by the current system 
since Thingpedia and ThingTalk have been improving. 
We recommend to look at the following devices as examples: 
+ [Giphy](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices/tree/master/com.giphy),
a very simple device which returns GIFs
+ [LinkedIn](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices/tree/master/com.linkedin),
an interface for LinkedIn which shows how authentication works. 
+ [LG TV](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices/tree/master/com.lg.tv.webos2),
a more complicated example which involves a physical device.

---

## Writing Device Metadata
All devices published on Thingpedia must include some metadata, called _Thing Manifest_.
Thing Manifest is written in JSON.
A JSON editor is provided to help you write it, which can be found at the
[creation page](https://almond.stanford.edu/thingpedia/upload/create), or by
clicking the _Upload new device_ button at the bottom of [Thingpedia page](https://almond.stanford.edu/thingpedia).

For each object field in the JSON, the following buttons are provided by the editor:
- Collapse/expand button: allows you to collapse or expand the current field; for optional field, a delete button will also be provided. 
- JSON button: allows you to edit the raw JSON
- Properties button: allows you to select/add new properties for the current field. 

### Thing ID, Thing Name, and Thing Description
Before you start editing the manifest, you will need to fill some basic information about your 
device at the creation page including `Thing ID`, `Thing Name`, and `Thing Description`.
`Thing ID` is a string that uniquely identifies the device class. 
A common way is to use reverse domain name notation. 
E.g., for LinkedIn in Thingpedia, its ID is `com.linkedin`.
`Thing Name` and `Thing Description` on the other hand will be used in the Thingpedia catalog,
so that user can know what your device does at a glance.

You are also encouraged to upload a PNG file as the icon for your device. 
The ZIP file with JS code will be introduced later.

### Package type
The first thing you need to specify in manifest is the type of package, which will change what 
other fields are needed. 
Currently, the system support the following package types:
- Custom JavaScript
- RSS Feed
- Generic REST

Most of the devices will be using `Custom JavaScript` type. 
For services retrieving data from RSS feed, `RSS Feed` types could be used to simplify the process.
Similarly, if a service only uses simple HTTP request methods, `Generic REST` can be used. 
For more details, please refer to [devices with zero code](/doc/thingpedia-device-with-zero-code.md). 

### User visible name and description
All the devices configured by a user will be shown in the user's [My Almond](https://almond.stanford.edu/me).
A name and a short description are required for each device. 
Typically this information is provided in the JS code which will introduce later.
But if you choose `RSS Feed` and `Generic REST` as your package type which requires no code, you need to specify 
them in the manifest.
To do so, click the `Properties` button at the top level of the JSON editor and tick the boxes for 
`User visible name` and `User visible description`, and fill them in. 

### Category, device domain, and device types
Field `Category` determines how a device will be configured and how it will appear in the UI. 
Valid categories include
- `Physical Device`: IoTs such as light bulb, thermostat, television.  
- `Online accounts`: services that require authentication including all social networks, email clients, etc.
- `Public Data Source`: public services like news feed, weather.
- `System Component`: only for internal use. 

Besides category, each device also needs to choose one of the following seven domains:
`media`, `social-network`, `home`, `communication`, `health`, `service`, and `data-management`.
These types are used for categorizing devices. A device without these types will not be
shown in the device list when users use `help` in Almond.  

The `types` array lists all the types that this device claims to conform to, e.g., `thermostat` or `speaker`.
If you list your device having a certain type, you inherit the natural language annotations of that type. 
`child_types` is similar, but marks your device as a collection device, and informs the system of the types that 
your child devices will expose. If the user says "_configure thermostat_" and your device lists `thermostat` as 
a child type, he will be offered to configure your device among other possibilities.   

### Authentication and configuration parameters
The combination of `Configuration Parameters` and `Authentication` determines the UI 
to configure the device. 
Refer to [complete guide for authentication and discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for more details. 

### Channels
To add a channel, click property button of `Queries` or `Actions` field, type in the name of the channel, and click `add` button.
Do not use `Triggers` field, which has been depreciated: now every trigger is defined as a monitor on a corresponding query. 

#### Arguments
To take full advantage of the functionality we provided in ThingTalk (filtering, chaining, etc.),  
every argument needed for ___both input and output___ should be listed here. 
Each of the argument includes the following attributes.  
- `name`: the name of the argument, which we suggest to name with lower case 
  letters with underscores between each word.  
- `type`: the type of the argument including: String, Number, Boolean, 
Entity(entity_type), Enum(value1,value2,...),
  PhoneNumber, EmailAddress, Location, Measure(unit), Date, Time, Picture. 
  For measurement, use units defined in [ThingTalk reference](/doc/thingtalk-reference.md)
- `required`, `question`: these annotations are
  related to slot filling; if your argument is required, the user will be asked
  `question` to fill the slot. Arguments for actions are always required, so
  the `required` property is ignored.

#### Natural language annotation 

- Doc String: this is only used for documentation for developers. 

- Canonical Form:
The canonical form of the channel name, used by the semantic parser;
it's a good idea to omit stop words for this, and to use a longer expression
such as `set target temperature on thermostat`.

- Local/Remote Confirmation String:
A string used to construct the final confirmation question
before a rule is created or an action is invoked; use the imperative form,
and refer to required arguments with `$argname`. 
Remote confirmation is optional for confirmation of remote command, where the owner of the device
can be referred by `$__person`.
E.g., a channel for posting on twitter could have local confirmation 
"_tweet $status_" and remote confirmation "_tweet $status on $\_\_person's twitter_".

#### Formatted output
This field specifies how the results will be presented to the user.
It contains a list of objects which will be shown to the users in order.  
Valid types of output include
- `text`: any text result, where parameters can be referred by syntax `${argname}`; if a parameter is of type `Measure`, the unit can be specified by `${argname:unit}`.
- `picture_url`: takes an url and shows users the corresponding picture.
- `rdl`: returns a clickable link.
- `code`: if you need more control over the output, such as different output based on results, you can choose this type and write Javascript code in the `Message` box. 

#### Polling interval
Queries may be monitored.
For example, the command to query the current weather can monitored, so that whenever the weather changes,
users will be notified. 
Polling interval field takes an integer in milliseconds to specify how often the query will be fired 
to check if any change happened.
If push notification is supported, leaves `0`.
If the query returns non-deterministic results (e.g., returning a random number), set polling interval to `-1`,
which means the system will not allow it to be monitored.


### Example Commands
The example commands provide both documentation for the user 
(they will be provided by `help <global-name>`) and training data for the system.
The accuracy of the parser heavily relies on the quality and quantity of examples.
Thus, developers are recommended to write as many example commands as possible to cover
all possible usage of your device.
The same with confirmation, argument can be referred with `$argname`.

Each example command requires a natural language utterance and its corresponding ThingTalk Program.
Please refer to [ThingTalk for Example Commands](/doc/thingpedia-device-intro-example-commands.md) for details. 


### Submission
The device will not automatically become available to users after submission, 
it is only available to you for testing. 
So feel free to click the `submit` button at the bottom of the page to save your manifest.  


---

## Writing Device Package

### The layout of a Device package
The Thingpedia API assumes a precise layout for a device package, which
must be a zip file containing exactly the JS files and the package.json,
as well as any dependency you need. You should not assume any nodejs
module beyond the 'thingpedia' module illustrated here - if you need any,
bundle them in your zip file. 

If there is no dependency needed and all your code is in one file, you can 
also upload the file directly, and we will generate the package.json and zip file for you. 

The JS version you should target is ES5,
but you can assume runtime services for ES6 (provided by babel-polyfill, preloaded),
and you are encouraged to use babel to compile from ES6 to ES5.
Our [Github repository](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices)
also provides an easy way to compile and generate the zip file.
Simply clone the repository and put your ES6 code into a folder and run `make`. 


For the package.json file, don't wrory about the additional attributes
_thingpedia-metadata_ and _thinepedia-version_ which appear in examples we
provided. They will be generated automatically when you upload your code to
Thingpedia with proper device metadata which we will introduce later.

The primary entry point (i.e., the one named as "main" in package.json)
should be a _device class_. You would instantiate the device class
from the API and set it directly to `module.exports`, as in

```javascript
const Tp = require('thingpedia');

module.exports = class MyDeviceClass extends Tp.BaseDevice {
    constructor(engine, state) {
         super(engine, state);
         // constructor
    }

    // other methods of device class
};
```

Then, for each query or action you want to expose, you would
add functions to your device class with prefix `get_` or `do_` respectively.
So for example, if
you want to expose query `get_profile` and action `get_share` for LinkedIn device, 
you would modify your `device.js` as follows:

```javascript
const Tp = require('thingpedia');

module.exports = class LinkedinDevice extends Tp.BaseDevice {
    constructor(engine, state) {
        super(engine, state);

        this.uniqueId = 'com.linkedin-' + this.userId;
        this.name = "LinkedIn Account of %s".format(this.userName);
        this.description = "This is your LinkedIn account";
    }

    get_get_profile() {
        // get user profile
    }

    do_share() {
        // share on LinkedIn
    }

    // other methods 
};
```

### A closer look to the Device class

#### The BaseDevice API

When you create a device class, you declare
a subclass of [`Tp.BaseDevice`](https://github.com/Stanford-IoT-Lab/thingpedia-api/blob/master/lib/base_device.js),
the base class of all device classes.

`Tp.BaseDevice` has you the following API:
- `this.name`: A string that will be shown in the list of devices a user owns in 
[My Almond](https://almond.stanford.edu/me/) page. A common way is to concatenate the kind and the user name
from the service. E.g., `this.name = "LinkedIn Account of %s".format(this.userName);`.
- `this.uniqueId`: A string that uniquely identifies the device instance in the
context of a given ThingSystem; you are supposed to compute it based on the
state and set it at the end of your constructor.
A common way to compute an unique ID is to concatenate the kind, a dash, and
then some device specific ID, as in LinkedIn, it would be `"com.linkedin-" + this.userId`.
- `this.description`: A string that describe the purpose of the device, which will be shown in My Almond page. 
- `this.state`: An arbitrary serializable JS object with data you will need to
talk to the device - including IP address, OAuth tokens, variable portions
of API urls, etc.  
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
- `runOAuth2`: if your device can be instantiated with an OAuth-like flow (user clicks on a button,
is redirected to a login page), this should be set to the handler; despite the name, this is
called also for OAuth 1
- `loadFromDiscovery`: discovery operations, described later

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
[complete guide for authentication and discovery](/doc/thingpedia-device-intro-auth-n-discovery.md).  


#### Stateful Channels

Often times, you will want to preserve state between different invocations
of your channel. Keeping it in memory is not enough though, because the
ThingSystem might be restarted at any time and the state would be lost.

Instead, you can require the `channel-state` capability (with `RequiredCapabilities: ['channel-state']`). The `state` object is persisted to disk, and has APIs:
- `state.get(key)`: return a state value
- `state.set(key, value)`: modify a state value

#### HTTP Helpers

Our system provide a generic interface `Tp.Helpers.Http` for basic HTTP request.
These are wrappers for [nodejs http API](https://nodejs.org/api/http.html)
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

### An Example
```javascript
"use strict";

const Tp = require('thingpedia');

const PROFILE_URL = 'https://api.linkedin.com/v1/people/~:(id,formatted-name,headline,industry,specialties,positions,picture-url)?format=json';
const SHARE_URL = 'https://api.linkedin.com/v1/people/~/shares?format=json';

module.exports = class LinkedinDevice extends Tp.BaseDevice {
    constructor(engine, state) {
        super(engine, state);

        this.uniqueId = 'com.linkedin-' + this.userId;
        this.name = "LinkedIn Account of %s".format(this.userName);
        this.description = "This is your LinkedIn account";
    }

    get userId() {
        return this.state.userId;
    }

    get userName() {
        return this.state.userName;
    }

    get_get_profile() {
        return Tp.Helpers.Http.get(PROFILE_URL, {
            useOAuth2: this,
            accept: 'application/json' }).then((response) => {
            const parsed = JSON.parse(response);

            return [{ formatted_name: parsed.formattedName,
                      headline: parsed.headline || '',
                      industry: parsed.industry || '',
                      specialties: parsed.specialties || '',
                      positions: ('values' in parsed) ? parsed.positions.values.map((p) => p.summary) : [],
                      profile_picture: parsed.pictureUrl || '' }];
        });
    }

    do_share({ status }) {
        return Tp.Helpers.Http.post(SHARE_URL, JSON.stringify({
            comment: status,
            visibility: {
                code: 'anyone'
            }
        }), {
            useOAuth2: this,
            dataContentType: 'application/json',
            accept: 'application/json'
        });
    }
};
```


--- 

## Publishing and Testing on Thingpedia

Once you are ready to let other people try your device interface, after thorough
local testing, you can publish it on Thingpedia.
You can submit your device by click the `Submit` button at the bottom of the 
[creation page](https://almond.stanford.edu/thingpedia/upload/create). 

Once submitted, the device is not automatically available to all users. Instead,
it is only available to you with your _developer key_, which you can retrieve
from your [user profile](https://thingpedia.stanford.edu/user/profile)
if you have already been approved to be a developer.
You should be able to test your device right away using the [Web Almond](/me/conversation) interface.
While if you want to test on Android Almond (which runs ThingSystem on your own
Android device with better privacy and discovery capability), you need one
more step: go to settings and enable cloud sync.
Currently, the Android Almond still requires some update before it can be used under
the latest version of ThingTalk and Thingpedia, so Web Almond is recommended.  

The device will become available after being reviewed and approved by a
Thingpedia administrator.

