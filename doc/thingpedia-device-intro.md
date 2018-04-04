# Writing Thingpedia Entries

---

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
All devices published on Thingpedia must include some metadata, called _Device Manifest_.
The Device Manifest is written in JSON.
A JSON editor is provided to help you write it, which can be found at the
[creation page](https://almond.stanford.edu/thingpedia/upload/create), or by
clicking the _Upload a new device_ button at the bottom of [Thingpedia page](https://almond.stanford.edu/thingpedia).

For each object field in the JSON, the following buttons are provided by the editor:
- Collapse/expand button: allows you to collapse or expand the current field; for optional field, a delete button will also be provided. 
- JSON button: allows you to edit the raw JSON
- Properties button: allows you to select/add new properties for the current field. 

### Device ID, Device Name, and Device Description
Before you start editing the manifest, you will need to fill some basic information about your 
device at the creation page including `Device ID`, `Device Name`, and `Device Description`.
`Device ID` is a string that uniquely identifies the device class. 
A common way is to use reverse domain name notation. 
E.g., for LinkedIn in Thingpedia, its ID is `com.linkedin`.
`Device Name` and `Device Description` on the other hand will be used in the Thingpedia catalog,
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
For more details, please refer to [device with zero code](/doc/thingpedia-device-with-zero-code.md). 

### User visible name and description
All the devices configured by a user will be shown in the user's [My Almond](https://almond.stanford.edu/me).
A name and a short description are required for each device. 
Typically this information is provided in the JS code which will introduce later.
But if you choose `RSS Feed` and `Generic REST` as your package type, you need to specify 
them in the manifest.
To do so, click the `Properties` button at the top level of the JSON editor and tick the boxes for 
`User visible name` and `User visible description`, and fill them in. 

### Category, device domain, and device types
Field `Category` determines how a device will be configured and how it will appear in the UI. 
Valid categories include
- `Physical Device`: IoTs such as light bulb, thermostat, television.
- `Online Accounts`: services that require authentication including all social networks, email clients, etc.
- `Public Data Source`: public services like news feed, weather.
- `System Component`: only for internal use.

Besides category, each device also needs to choose one of the following seven domains:
`media`, `social-network`, `home`, `communication`, `health`, `service`, and `data-management`.
These types are used for categorizing devices. A device without these types will not be
shown in the device list when users use `help` in Almond.

The `types` array lists all the types that this device claims to conform to, e.g., `thermostat` or `speaker`.
If you list your device as having a certain type, you inherit the natural language annotations of that type. 
`child_types` is similar, but marks your device as a collection device, and informs the system of the types that 
your child devices will expose. If the user says "_configure thermostat_" and your device lists `thermostat` as 
as a type or child type, he will be offered to configure your device among other possibilities.

### Authentication and configuration parameters
The combination of `Configuration Parameters` and `Authentication` determines the UI 
to configure the device. 
Refer to [complete guide for authentication and discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for more details. 

### Functions
To add a function, click property button of `Queries` or `Actions` field, type in the name of the function, and click `add` button.

#### Queries and Actions

The user interacts with your Thingpedia device through queries and actions, so the first step is to decide on what queries and actions
you should expose.

The only requirement imposed from Thingpedia is that queries are free of side-effects and can return results (as output arguments),
and actions have side effects, and cannot return results. Other than that, the design of which functions to include is highly device specific.
At a high level, you should keep in mind the following guidelines to achieve the best natural language results:

- queries should be designed to return a list of results, one for each element that
  the user can operate on; arguments should refer to the single value for each result;
  for example, to return a list of blog posts, design a query called `posts` with arguments
  `title` and `link` - each argument refers to a single post only
- if some natural language command can be ambiguous between two functions, you must
  merge the functions together and distinguish them by a parameter;
  for example, rather than having `com.mynewspaper.world` and `com.mynewspaper.opinions`, use
  `com.mynewspaper.get` with a `section` parameter, so the user can leave the section ambiguous
- if some functionality can be achieved in ThingTalk using filters, you cannot have it
  as a function too;
  for example, rather than `com.example.search_by_author`, you should use `com.example.search`
  and use a filter on the `author` parameter

#### Arguments
To take full advantage of the functionality we provided in ThingTalk (filtering, chaining, etc.),  
every argument needed for ___both input and output___ should be listed here. 
Each of the argument includes the following attributes.  
- `name`: the name of the argument, which we suggest to name with lower case 
  letters with underscores between each word.
- `type`: the type of the argument including: String, Number, Boolean, Date, Time, Location,
Entity(...), Enum(...), Measure(...), etc.
  For the full list, see the [ThingTalk reference](/doc/thingtalk-reference.md)
- `is_input`: tick the check box if the argument is an input argument, leave it
  unticked if is an output. Arguments for actions are always input, and an error
  occurs if you leave the checkbox unticked.
- `required`, `question`: these annotations are
  related to slot filling; if your argument is required, the user will be asked
  `question` to fill the slot.

##### Argument Name Conventions

The choice of argument name is important because it affects the natural language translation.
To achieve the best accuracy, you should the same argument names as other similar devices, and you
should follow these conventions:

- if your function returns a picture as the main result, name the argument `picture_url`
- if your function accepts a picture as input, name the argument `picture_url`
- if your function accepts any URL, name the argument `url`; if it accepts any URL of videos, name it `video_url`
- if your function returns an article or link, name the title `title`, the blurb or description `description`,
  the URL `link`, the update date `updated` and the author name `author`
- if your function accepts a query string to search, name it `query`
- if your function allows you to upload a picture with a short description, name the description `caption` and
  the picture `picture_url`
- if your function takes a free-form string to be posted on social media, name it `status`
- if your function takes two free-form strings to be posted on social media, name them `title` and `body`
- if your function turns on or off your device, name the function `set_power`, name the argument `power` and make it of type `Enum(on,off)`
- if your function takes a numeric range as input, name the lower bound `low` and the upper bound `high`
- if your function returns multiple results, and you can control the number of results returned, use a `count` parameter of type `Number`

#### Natural language annotation 

- Doc String: this is only used for documentation for developers. 

- Canonical Form:
The canonical form of the function name, used by the semantic parser (certain versions);
it's a good idea to omit stop words for this, and to use a longer expression
such as `set target temperature on thermostat`. You must omit all parameters and filters
from the canonical form.

- Local/Remote Confirmation String:
A string used to construct the final confirmation question before a rule is created
or an action is invoked. For actions, use the imperative form, e.g. “post on My Social Network”,
and for query use the noun-phrase form e.g. “the latest posts in your feed”.
You can refer to required arguments with `$argname` or `${argname}` (the latter is only needed if
the argument is immediately followed by a letter number or underscore).

The remote confirmation is optional; if given, it is used to confirm commands that refer to other
user's devices (_remote commands_). The owner of the device can be referred by `$__person`.

#### Formatted output
This field specifies how the results will be presented to the user.
It contains a list of outputs which will be shown to the users in order.

Depending on the type of output, you must fill different properties, by enabling
them from the JSON editor. In each property, input and output parameters of the function can be referred to
by using the syntax `$argname` or `${argname}`. If a parameter is of type `Measure`, the unit can be specified by `${argname:unit}`.
If a parameter is a `Number`, you can have it formatted as percentage as `${argname:%}`.
If a parameter is a `Date`, you can use `${argname:date}` to show just the date, and `${argname:time}` to show just the time.

Valid types of output include
- `text`: a simple text or voice message; this output type has only one property: `text` (“Message” in the editor).
- `picture`: shows a picture to the user; this output type has one property: `url` (“Picture URL” in the editor).
- `rdl`: returns a clickable with optional title and description link, suitable for website links and news articles
  you must specify the property `webCallback` (“Link URL”), `displayTitle` (“Link Title”) and `displayText` (“Link Text”).
- `code`: if you need more control over the output, such as different output based on results, you can choose this type and write Javascript code in the `code` property (“Formatting Function” in the editor). The result function will be invoked with three arguments: the result of your function (an object with each argument as a property), a hint informing you of how the result will be shown to the user, and a `Formatter` object. The function can return a string, a formatted message object (with the same structure as the JSON described here) or an array of objects. See [https://github.com/Stanford-Mobisocial-IoT-Lab/ThingTalk/blob/master/lib/formatter.js] for details.

#### Polling interval
Queries may be monitored.
For example, the command to query the current weather can monitored, so that whenever the weather changes,
users will be notified. 
Polling interval field takes an integer in milliseconds to specify how often the query will be fired 
to check if any change happened.

If your query supports push notifications, leave the polling interval as `0`.
If the query returns non-deterministic results (e.g., a random number), set polling interval to `-1`,
which will prevent the user from monitoring it.

### Example Commands
The example commands provide both documentation for the user 
(they will be provided by `help <name>`) and training data for the system.
The accuracy of the parser heavily relies on the quality and quantity of examples.
Thus, developers are recommended to write as many example commands as possible to cover
all possible usage of your device.

Each example command requires a natural language utterance and its corresponding ThingTalk Program.
Please refer to [ThingTalk for Example Commands](/doc/thingpedia-device-intro-example-commands.md) for details. 

### Save
Currently, our website does not allow submission without actual code if you choose `Custom Javascript` as package type. 
To save your manifest, you will need to click the `JSON` button at the top level of the JSON editor, copy your JSON code, and save it locally. 
And to recover next time, simply replace the replace the JSON with the one you saved.


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
Our [Github repository](https://github.com/Stanford-Mobisocial-IoT-Lab/thingpedia-common-devices)
also provides an easy way to generate the zip file.
Simply clone the repository and put your code into a folder and run `make`. 

For the package.json file, don't worry about the additional attribute
_thingpedia-version_ which appear in examples we provided. The attribute
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
a subclass of [`Tp.BaseDevice`](https://github.com/Stanford-IoT-Lab/thingpedia-api/blob/master/lib/base_device.js),
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

Once you are ready to let other people try your device interface, after thorough
local testing, you can publish it on Thingpedia.
You can submit your device by click the `Submit` button at the bottom of the 
[creation page](https://almond.stanford.edu/thingpedia/upload/create). 

Once submitted, the device is not automatically available to all users. Instead,
it is only available to you with your _developer key_, which you can retrieve
from your [user profile](https://thingpedia.stanford.edu/user/profile)
if you have already been approved to be a developer.
You should be able to test your device right away using the [Web Almond](/me/conversation) interface.
While if you want to test on Android Almond, you need one
more step: go to settings and enable cloud sync.
Currently, the Android Almond still requires some update before it can be used under
the latest version of ThingTalk and Thingpedia, so Web Almond is recommended.

The device will become available after being reviewed and approved by a
Thingpedia administrator.

