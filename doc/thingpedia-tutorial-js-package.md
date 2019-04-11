# Write JS Device Packages

[[toc]]

If you choose to use the loader provided by `@org.thingpdedia.v2` in your manifest,
a _device package_ is required for your device. 
It contains the Javascript code describing the details about how your device 
will be configured and how each function behaves. 
In the following, this tutorial will continue using The Cat API as an example
to show how the package is organized and how to write it. 

## The layout of a device package
The Thingpedia API assumes a precise layout for a device package, which
must be a zip file containing exactly the JS files and the package.json,
as well as any dependency you need. You should not assume any nodejs
module beyond the 'thingpedia' module illustrated here - if you need any,
bundle them in your zip file. 

If there is no dependency needed and all your code is in one file, you can 
also upload the file directly, and we will generate the package.json and zip file for you.

If you are using a Mac, please use command line to compress the folder: 
```
cd your-folder-name
zip -r ../xx.zip *
```
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

## The `BaseDevice` API

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

## Handling authentication and discovery

Unlike The Cat API, lots of devices will require some kind of authentication.
Three ways to do
authentication are supported, including `basic` (traditional username and
password), `oauth2` (OAuth 1.0 and 2.0 style authentication), and `discovery`
(authentication by discovery and local interactive paring). Here's a
[complete guide for authentication and discovery](/doc/thingpedia-device-intro-auth-n-discovery.md).  

## HTTP helpers

Our system provides a generic interface `Tp.Helpers.Http` for basic HTTP request.
These are wrappers for [nodejs http API](https://nodejs.org/api/http.html)
with a Promise interface.

Two of the most useful interfaces are probably 
`Tp.Helpers.Http.get()` and `Tp.Helpers.Http.post()`, which deal with HTTP GET request
and POST request, respectively. We will see an example in practice in the next section.

A full list of the available APIs can be found in 
[Thingpedia interface reference](/doc/thingpedia-helpers.md#module-helpers-http)

## Query and action
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

The details of how different ThingTalk types are represented in Javascript
can be found in [ThingTalk Reference](/doc/thingtalk-reference.md). 

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

## The first JS package: The Cat API 
Put all the components together, we have The Cat API code as follows. 
Since no library other than `thingpedia` is needed for this package. We can simply upload the `.js` file
in the metadata page, and the `.zip` package will be generated automatically.
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
