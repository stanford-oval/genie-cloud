# Tutorial 4: Write Your Own Device

[[toc]]

In this tutorial, 
we will use [The Cat API](https://almond.stanford.edu/thingpedia/devices/by-id/com.thecatapi) 
again as a running example.
But unlike Tutorial 2, we will explain more details about each step.
We encourage you to create a device you are interested in to work through this tutorial.
To avoid getting into the details of the OAuth authentication or configuration for IoTs too early,
we recommend to try a public web service which requires no authentication or only needs an API key. 
You can find a collective list of public APIs from [toddmotto/public-apis](https://github.com/toddmotto/public-apis).

We also recommend that you visit our [community forum](https://community.almond.stanford.edu),
as you will find important information discovered by other developers like you, and you'll
be able to connect with other developers working on similar devices; or who knows, maybe someone
already has built what you need?

## Get started
A developer account is required to make contributions to Thingpedia. 
You can request a developer account from [here](/user/request-developer).
Once you have done that, you will be able to upload your own devices to Thingpedia and
enable users to use it through Almond.

The device creation page lives 
[here](https://almond.stanford.edu/thingpedia/upload/create).
It can be reached from the "Upload a new device" button 
at the bottom of [Thingpedia Portal](https://almond.stanford.edu/thingpedia)
or [Thingpedia Developer Console](https://almond.stanford.edu/thingpedia/developers).
It looks like this: 

![screenshot](/images/docs/metadata_page.png)

---

## Fill in basic information
First, you will need to fill some basic _metadata_ about your device, 
including `ID`, `Name`, `Description`, `Category`, and `Icon`. The information
will be used to present your device to the users in Thingpedia and Almond clients.

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

`Icon` is required to be a `.PNG` file and a 512x512 picture is recommended.

`JS Device Package` is an optional package depending on the type of your device specified 
in the manifest. It contains the JS code describing the details of the configuration and 
function behavior. This will be introduced in detail [later](#writing-js-device-package) in the tutorial.

---

## Define the device class
All devices published on Thingpedia must include _device manifest_ written in ThingTalk, 
i.e., `manifest.tt`.
It defines the _device class_ you want to create. 
Check [Writing Device Class](/doc/thingpedia-tutorial-manifest.md) for the instructions on 
how to write a device class. 

---

## Supply natural language data 
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
## Write the JS device package
Depending on the type of your device, you might need 
to provide a _device package_ containing the Javascript code
to describe more details about how the device is configured and how each function behaves. 
This package will need to be uploaded at the metadata page before you submit.
Check [Writing JS Device Packages](/doc/thingpedia-tutorial-js-package.md)
for its tutorial.

--- 

## Publish and test on Thingpedia

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

When you upload your device the first time, you will get some limited natural language support 
after around 5 minutes. 
If you think your device is ready and want to get the full natural language support, 
click on the `Start training` button at the bottom of the details page of your device
to start a new training job. This takes up to 15 hours. 
You can see the status of the training at the top of the details page for your device. 
The training is complete when the blue banner disappears. 
When you edit it later, your device will be usable but the language might not reflect your latest changes.
Before the training is ready, you can test by typing ThingTalk directly; this is accomplished using the `\t` prefix in Web Almond. 
For example, to test the `get` command for The Cat API, 
you can write: `\t now => @com.thecatapi.get(count=3) => notify;`. 
Please refer to [ThingTalk by Examples](/doc/thingtalk-intro.md) for more details about how to write a command in ThingTalk.

The device will become available to other users after being reviewed and approved by a
Thingpedia administrator.

### Access logs

If you click on [Almond Status and Logs](/me/status) on the sidebar,
you will access the status of your Almond. In particular, you get access
to the full execution log.
You can use `console.log` and `console.error` from your code to print in these logs.

Or maybe we made a mistake in writing Almond, in which case, when you
[report a bug](https://github.com/Stanford-IoT-Lab/thingengine-platform-cloud/issues) we will
appreciate seeing the full debug log (don't forget to redact your personal info
away!).


## Need more examples?
You can go to our [Github repository](https://github.com/stanford-oval/thingpedia-common-devices)
to see more device packages we developed, and observe these concepts we introduced in action. 

We recommend to look at the following devices as examples: 
+ Giphy [[Thingpedia]](https://almond.stanford.edu/thingpedia/classes/by-id/com.giphy) 
[[Github]](https://github.com/stanford-oval/thingpedia-common-devices/tree/master/com.giphy):
a very simple device which returns GIFs
+ LinkedIn [[Thingpedia]](https://almond.stanford.edu/thingpedia/classes/by-id/com.linkedin) 
[[Github]](https://github.com/stanford-oval/thingpedia-common-devices/tree/master/com.linkedin):
an interface for LinkedIn which shows how authentication works. 
+ LG TV [[Thingpedia]](https://almond.stanford.edu/thingpedia/classes/by-id/com.lg.tv.webos2) 
[[Github]](https://github.com/stanford-oval/thingpedia-common-devices/tree/master/com.lg.tv.webos2):
a more complicated example which involves a physical device.

