This is the documentation for the Thingpedia SDK.
It contains the APIs available to Thingpedia devices (JS packages uploaded to Thingpedia),
and the APIs that can be used to load Thingpedia devices from JS clients.

Note: if you are writing an interface for Thingpedia, you must not bundle a separate copy
of the Thingpedia SDK. The correct version is already available in the environment and you should directly `require('thingpedia')`.
You should install the Thingpedia SDK from npm only when you're developing a client to Thingpedia,
or as a "devDependency" for testing your Thingpedia interface.
