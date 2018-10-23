# Writing Thingpedia Entries

[[toc]]

## Getting started
A developer account is required to make contributions to Thingpedia. 
You can request a developer account from [here](/user/request-developer).
Once you are approved by the Thingpedia administrators
(you can check your status from [your profile page](/user/profile)),
you will be able to upload your own devices to Thingpedia and
enable users to use it through Almond. 
(We use the term _device_ to refer to both physical device and web service.)

The device creation page lives 
[here](https://almond.stanford.edu/thingpedia/upload/create).
It can be reached from the "Upload a new device" button 
at the bottom of [Thingpedia Portal](https://almond.stanford.edu/thingpedia)
or [Thingpedia Developer Portal](https://almond.stanford.edu/thingpedia/developers).
It looks like this: 

![screenshot](/images/docs/metadata_page.png)

In the following, we will use 
[The Cat API](https://almond.stanford.edu/thingpedia/devices/by-id/com.thecatapi) 
as a running example to go through the steps of creating a device in Thingpedia. 
We highly recommend you to choose a device you are interested in to work though this tutorial. 
However, to avoid getting into the details of the OAuth authentication or configuration for IoTs too early,
a public web service which requires no authentication or only needs an API key would
be preferred. 
You can find a collective list of public APIs from [toddmotto/public-apis](https://github.com/toddmotto/public-apis).


---

## Writing the metadata
First, you will need to fill some basic _metadata_ about your device, 
including `ID`, `Name`, `Description`, `Category`, and `Icon`.

`ID` is a string that **uniquely** identifies the device class. 
A reverse domain name notation is required. 
E.g., ID of The Cat API is `com.thecatapi` because it is service provided by `https://thecatapi.com`.
Similarly, the ID of [NASA Daily](https://almond.stanford.edu/thingpedia/devices/by-id/gov.nasa) is `gov.nasa`
and the ID of [Google Drive](https://almond.stanford.edu/thingpedia/devices/by-id/com.google.drive) is `com.google.drive`.

`Name` and `Description` on the other hand will be used in the Thingpedia catalog,
so that user can know what your device does at a glance. E.g., "The Cat API" looks
like this in Thingpedia catalog:

![screenshot](/images/docs/thingpedia_catalog.png)

`Category` helps us organize the devices on Thingpedia and makes it easier 
for users to search for your device. It could be one of the following seven domains:
- `Media`: e.g., news, comics, and The Cat API.
- `Social Network`: e.g., Facebook, Twitter.
- `Home`: smart home devices such as security camera, smart TV.
- `Communication`: e.g., messaging services, email, sms. 
- `Health & Fitness`: e.g., fitness tracker, health-related IoTs. 
- `Data Management`: e.g., cloud storage services, Github.
- `Others`: everything else, such as weather, calendar.

These types are also used for categorizing devices. A device without these types will not be
shown in the device list when users use `help` in Almond.

`Icon` is required to be a `.PNG` file and a 512x512 picture is recommended.

`JS Device Package` is an optional package depending on the type of your device specified 
in the manifest. It contains the JS code describing the details of the configuration and 
function behavior. This will be introduced in detail [later](#writing-js-device-package) in this tutorial.

---

## Writing the manifest
All devices published on Thingpedia must include _device manifest_ written in ThingTalk, 
i.e., `manifest.tt`.
It defines the _device class_ you want to create whose name is the `ID` defined in the metadata. 
Check [Writing Device Class](/doc/thingpedia-tutorial-manifest.md) for the instructions on 
how to write a device class. 

A ThingTalk editor is provided to help you write it, which can be found at the
[creation page](/thingpedia/upload/create).

---

## Writing the dataset 
In addition to the device manifest, developers are also required to provide example
natural language utterances corresponding to the functions supported by the device
in `dataset.tt`.

The examples provide both documentation for the user 
(they will be provided by `help <name>`) and training data for the system.
The accuracy of the parser heavily relies on the quality and quantity of examples.
Thus, developers are recommended to write as many example commands as possible to cover
all possible usage of your device. 
Check [Writing Example Commands for Your Device](/doc/thingpedia-tutorial-dataset.md)
for detailed instruction on how to write the examples. 

---
## Writing the JS device package
Depending on the type of your device, you might need 
to provide a _device package_ containing the Javascript code
to describe more details about how the device is configured and how each function behaves. 
This package will need to be uploaded at the metadata page before you submit.

### The layout of a device package
The Thingpedia API assumes a precise layout for a device package, which
must be a zip file containing exactly the JS files and the package.json,
as well as any dependency you need. You should not assume any nodejs
module beyond the 'thingpedia' module illustrated here - if you need any,
bundle them in your zip file. 

If there is no dependency needed and all your code is in one file, you can 
also upload the file directly, and we will generate the package.json and zip file for you.

If you are using a Mac, please use command line to compress the folder: 
`zip -r xx.zip your-folder-name`. 
Compressing from the right-click menu in Mac will create a new folder which 
makes the system fail to find the files in the root directory.

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
you want to expose query `get` for The Cat API, 
you would modify your `device.js` as follows:

```javascript
const Tp = require('thingpedia');

module.exports = class CatAPIDevice extends Tp.BaseDevice {
    constructor(engine, state) {
        super(engine, state);
        // constructor
    }

    get_get() {
        // return cat pictures
    }
};
```

### The `BaseDevice` API

When you create a device class, you declare
a subclass of [`Tp.BaseDevice`](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-api/blob/master/lib/base_device.js),
the base class of all device classes.

To construct the subclass, three properties are required: `uniqueId`, `name`, and `description`
Different from the `ID` in the metadata, `uniqueId` uniquely identifies the device **instance**
of a user. For example, a user may configure two different Twitter accounts, and they will need
different IDs in Almond. A common way is to concatenate the device ID, a dash, and then a specific 
ID for the  corresponding account. E.g., `"com.twitter" + this.state.userId`.
Similarly, `name` and `description` will be used in [My Almond](/me) and they should be different
for different accounts, so that users can easily tell which account an instance associates with.
For example, for Twitter, the name could be `"Twitter Account for " + this.state.screenName`.

For The Cat API, since it is a public service and there will be only one instance for each user,
we can just use the same ID, name, and description in metadata: 

```javascript 
constructor(engine, state) {
    super(engine, state);

    this.uniqueId = 'com.thecatapi';
    this.name = "The Cat API";
    this.description = "Where every day is Caturday!";
}
```

The full reference of the `BaseDevice` class is given in the [Thingpedia interface reference](/doc/thingpedia-helpers.md#class-basedevice). 

### Handling authentication and discovery

Unlike The Cat API, lots of devices will require some kind of authentication.
Three ways to do
authentication are supported, including `basic` (traditional username and
password), `oauth2` (OAuth 1.0 and 2.0 style authentication), and `discovery`
(authentication by discovery and local interactive paring). Here's a
[complete guide for authentication and discovery](/doc/thingpedia-device-intro-auth-n-discovery.md).  

### HTTP helpers

Our system provides a generic interface `Tp.Helpers.Http` for basic HTTP request.
These are wrappers for [nodejs http API](https://nodejs.org/api/http.html)
with a Promise interface.

Two of the most useful interfaces are probably 
`Tp.Helpers.Http.get()` and `Tp.Helpers.Http.post()`, which deal with HTTP GET request
and POST request, respectively. We will see an example in practice in the next section.

A full list of the available APIs can be found in 
[Thingpedia interface reference](/doc/thingpedia-helpers.md#module-helpers-http)

### Query and action
Recall that we separate Thingpedia functions in two different types: query and action.
A query returns data and makes no side effect, while action does not return any data but makes side effect to the world.

Both query and action take an Object to get the value of input parameters. 
For example, `get` function in The Cat API has one input parameter `count`, thus the function will look like: 
```javascript
get_get({ count }) {
    // returns $count cat pictures 
}
```

A Query always returns an array of Object specifies the value of each output parameter.
For example, `get` function in The Cat API has 3 output parameters `image_id`, `pictuer_url`, and `link`, 
the output should look like:
```javascript
get_get({ count }) {
    ...
    return [{ image_id: ..., picture_url: ..., link: ... }];
}
```

Now let's implement the `get` function for The Cat API for real with HTTP helpers.
The function should look like this: 
```javascript
get_get({ count }) {
    count = count || 1; // fetch 1 cat by default
    const url = URL + '&results_per_page=' + count;
    return Tp.Helpers.Http.get(url).then((result) => Tp.Helpers.Xml.parseString(result))
    .then((parsed) => {
        const array = parsed.response.data[0].images[0].image;
        return array.map((image) => {
            return { image_id: image.id[0], 
                     picture_url: image.url[0],
                     link: 'http://thecatapi.com/?id=' + image.id[0] };
        });
    });
}
```

`count` is an optional input parameter, we set it to 1 if it's left unspecified.
Then we call `Tp.Helpers.Http.get()` to the URL of the API endpoint.
The Cat API returns the result in `XML` format, so we parse it with `Tp.Helpers.Xml.parseString()`
to extract a JS Object.
Then we find the values we need and assign them to the corresponding parameters for return. 
Note that, we used [`Array.prototype.map()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
to create the returned Array. 
Don't be fooled by the final `return` statement, we are still returning an Array.

### The first JS package: The Cat API 
Put all the components together, we have The Cat API code as follows. 
Since no library other than `thingpedia` is needed for this package. We can simply upload the `.js` file,
and the `.zip` package will be generated automatically.
```javascript
"use strict";

const Tp = require('thingpedia');

const URL = 'http://thecatapi.com/api/images/get?api_key=<YOUR-API-KEY>&format=xml&type=jpg,png';

module.exports = class CatAPIDevice extends Tp.BaseDevice {
    constructor(engine, state) {
        super(engine, state);

        this.uniqueId = 'com.thecatapi';
        this.name = "The Cat API";
        this.description = "Where every day is Caturday!";
    }

    get_get({ count }) {
        count = count || 1;
        const url = URL + '&results_per_page=' + count;
        return Tp.Helpers.Http.get(url).then((result) => Tp.Helpers.Xml.parseString(result))
        .then((parsed) => {
            const array = parsed.response.data[0].images[0].image;
            return array.map((image) => {
                return { image_id: image.id[0], 
                         picture_url: image.url[0],
                         link: 'http://thecatapi.com/?id=' + image.id[0] };
            });
        });
    }
};
```

--- 

## Publishing and testing on Thingpedia

Once you are ready to let other people try your device, you can publish it on Thingpedia.
You can submit your device by clicking the `Create` button at the top of the 
[creation page](/thingpedia/upload/create). 

Once submitted, the device is not automatically available to all users. Instead,
it is only available to you with your _developer key_, which you can retrieve
from your [user profile](/user/profile)
if you have already been approved to be a developer.
You should be able to test your device right away using the [Web Almond](/me/conversation) interface.
While if you want to test on Android Almond, you need one
more step: go to settings and enable cloud sync.

When you upload your device the first time, you cannot use the natural language at all until it is fully trained.
When you edit it later, your device will be usable but the language might not reflect your latest changes.
The training of natural language takes up to 8 hours. You can see the status of the training at the top of the details page for your entry. 
The training is complete when the blue banner disappears. 
Before the training is ready, you can test by typing ThingTalk directly; this is accomplished using the `\t` prefix in Web Almond. 
For example, to test the `get` command for The Cat API, 
you can write: `\t now => @com.thecatapi.get(count=3) => notify;`. 
Please refer to [ThingTalk by Examples](/doc/thingtalk-intro.md) for more details about how to write a command in ThingTalk.

The device will become available to other users after being reviewed and approved by a
Thingpedia administrator.

### Accessing logs

If you click on [Almond Status and Logs](/me/status) on the sidebar,
you will access the status of your Almond. In particular, you get access
to the full execution log.
You can use `console.log` and `console.error` from your code to print in these logs.

Or maybe we made a mistake in writing Almond, in which case, when you
[report a bug](https://github.com/Stanford-IoT-Lab/thingengine-platform-cloud/issues) we will
appreciate seeing the full debug log (don't forget to redact your personal info
away!).


## Need more examples?
You can go to our [Github repository](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices)
to see more device packages we developed, and observe these concepts we introduced in action. 

We recommend to look at the following devices as examples: 
+ [Giphy](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices/tree/master/com.giphy),
a very simple device which returns GIFs
+ [LinkedIn](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices/tree/master/com.linkedin),
an interface for LinkedIn which shows how authentication works. 
+ [LG TV](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices/tree/master/com.lg.tv.webos2),
a more complicated example which involves a physical device.