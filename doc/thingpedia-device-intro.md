# Writing Thingpedia Entries

[[toc]]

## Getting Started

### The basics: Devices and Functions

At the highest level, a Thingpedia entries is just a nodejs
package, whose main entry point is a _device class_.

From a device class, the system will obtain _device instances_,
which are the individual objects that represent things in
the system (we use "device" as a term in the code to mean both
physical devices and web services). A device instance contains
all the descriptors that are needed to identify the thing,
such as account ID or IP/MAC address, and contains any authentication
information.

From each device instance, when needed the system will invoke
_Thingpedia functions_. A Thingpedia function is an abstraction over
a query or an action.

### Become a developer

At the moment, Thingpedia is still in closed beta. But you can request a
developer account from
[here](/user/request-developer).
Once you are approved by the Thingpedia administrators
(you can check your status
from [your profile page](/user/profile)),
you will be able to upload your own devices or services to Thingpedia and
enable users to use it through Almond.

### Looking for examples?
You can download the source code of any existing "supported interfaces" from
[Thingpedia](/thingpedia/devices).
In addition, you can go to our [Github repository](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices)
to see the device packages we developed, and observe these concepts
in action. 

---


## Writing Device Metadata
Getting started, some basic metadata about your device needs to be provided. 
The metadata includes `ID`, `Name`, `Description`, `Category`, `Icon`, and `JS code`.

`ID` is a string that uniquely identifies the device class. 
A common way is to use reverse domain name notation. 
E.g., for LinkedIn in Thingpedia, its ID is `com.linkedin`.

`Name` and `Description` on the other hand will be used in the Thingpedia catalog,
so that user can know what your device does at a glance.

`Category` helps us organize the devices on Thingpedia and makes it easier 
for users to search for your device. It could be one of the following seven domains:
`media`, `social-network`, `home`, `communication`, `health`, `data-management`, and `others`.
These types are also used for categorizing devices. A device without these types will not be
shown in the device list when users use `help` in Almond.

`Icon` is required to be a `.PNG` file and a square picture is recommended, 
and `JS Device Package` will be introduced later.

---

## Writing Device Manifest
All devices published on Thingpedia must include _device manifest_ written in ThingTalk.
It defines the _device class_ you want to create whose name is the `ID` defined in device metadata. 
Check [Writing Device Class](/doc/thingpedia-device-class.md) for the instructions on 
how to write a device class. 

A ThingTalk editor is provided to help you write it, which can be found at the
[creation page](/thingpedia/upload/create).

---

## Writing Dataset 
In addition to the device manifest, developers are also required to provide example
natural language utterances corresponding to the functions supported by the device.

The examples provide both documentation for the user 
(they will be provided by `help <name>`) and training data for the system.
The accuracy of the parser heavily relies on the quality and quantity of examples.
Thus, developers are recommended to write as many example commands as possible to cover
all possible usage of your device. 
Check [Writing Example Commands for Your Device](/doc/thingpedia-device-intro-example-commands.md)
for detailed instruction on how to write the examples. 

---
## Writing Device Package
If the `loader` from mixin `org.thingpedia.v2` is chosen in the device manifest, 
developers are required to provide a _device package_ containing the Javascript code
to describe more details about how the device is configured and how each function behaves. 

### The layout of a Device package
The Thingpedia API assumes a precise layout for a device package, which
must be a zip file containing exactly the JS files and the package.json,
as well as any dependency you need. You should not assume any nodejs
module beyond the 'thingpedia' module illustrated here - if you need any,
bundle them in your zip file. 

If you are using a Mac, please use command line to compress the folder: 
`zip -r xx.zip your-folder-name`. 
Compressing from the right-click menu in Mac will create a new folder which 
makes the system fail to find the files in the root directory.

If there is no dependency needed and all your code is in one file, you can 
also upload the file directly, and we will generate the package.json and zip file for you. 

For the package.json file, don't worry about the additional attribute
_thingpedia-version_ which appear in the examples we provided. The attribute
will be generated automatically when you upload your code to
Thingpedia with proper device metadata.

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

(Our code and examples make heavy use of modern JavaScript features, also known as ES2015.
If you are not familiar with the class syntax, see the [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes))

Then, for each query or action you want to expose, you would
add functions to your device class with prefix `get_` or `do_` respectively.
So for example, if
you want to expose query `get_profile` and action `share` for LinkedIn device, 
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
a subclass of [`Tp.BaseDevice`](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-api/blob/master/lib/base_device.js),
the base class of all device classes.

The full reference of the `BaseDevice` class is given in the [Thingpedia interface reference](/doc/thingpedia-helpers.md#class-basedevice).

#### Handling authentication and discovery

Most devices will require some kind of authentication, three ways to do
authentication are supported, including `basic` (traditional username and
password), `oauth2` (OAuth 1.0 and 2.0 style authentication), and `discovery`
(authentication by discovery and local interactive paring). Here's a
[complete guide for authentication and discovery](/doc/thingpedia-device-intro-auth-n-discovery.md).  

#### HTTP Helpers

Our system provide a generic interface `Tp.Helpers.Http` for basic HTTP request.
These are wrappers for [nodejs http API](https://nodejs.org/api/http.html)
with a Promise interface.

The available APIs are described in [Thingpedia interface reference](/doc/thingpedia-helpers.md#module-helpers-http)

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

Once you are ready to let other people try your device interface, you can publish it on Thingpedia.
You can submit your device by click the `Submit` button at the bottom of the 
[creation page](/thingpedia/upload/create). 

Once submitted, the device is not automatically available to all users. Instead,
it is only available to you with your _developer key_, which you can retrieve
from your [user profile](/user/profile)
if you have already been approved to be a developer.
You should be able to test your device right away using the [Web Almond](/me/conversation) interface.
While if you want to test on Android Almond, you need one
more step: go to settings and enable cloud sync.
Currently, the Android Almond still requires some update before it can be used under
the latest version of ThingTalk and Thingpedia, so Web Almond is recommended.

When you upload your device the first time, you cannot use the natural language at all until it is fully trained.
When you edit it later, your device will be usable but the language might not reflect your latest changes.
The training of natural language takes up to 8 hours. You can see the status of the training at the top of the details page for your entry. 
The training is complete when the blue banner disappears. 
Before the training is ready, you can test by typing ThingTalk directly; this is accomplished using the `\t` prefix in Web Almond. For example, to test the command 
`@org.weather.current`, you can write: `\t now => @org.weather.current() => notify;`

The device will become available to other users after being reviewed and approved by a
Thingpedia administrator.

### Accessing Logs

If you click on [Almond Status and Log](/me/status) on the side bar,
you will access the status of your Almond. In particular, you get access
to the full execution log.
You can use `console.log` and `console.error` from your code to print in these logs.

Or maybe we made a mistake in writing Almond, in which case, when you
[report a bug](https://github.com/Stanford-IoT-Lab/thingengine-platform-cloud/issues) we will
appreciate seeing the full debug log (don't forget to redact your personal info
away!).
