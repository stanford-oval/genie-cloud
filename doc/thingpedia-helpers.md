# Thingpedia Device API Reference

This documents details the APIs available to Thingpedia devices (JS packages uploaded to Thingpedia).
Most APIs are part of the [thingpedia](https://github.com/stanford-oval/thingpedia-api) JS package,
with the exception of the [Engine class](#class-engine) and the [Platform class](#class-platform), which
are part of [thingengine-core](https://github.com/stanford-oval/thingengine-core).

[[toc]]

## Top-level package

The `thingpedia` package contains:

- [`version`](#versioning-of-thingpedia)
- [`BaseDevice`](#class-basedevice)
- [`Availability`](#enum-availability)
- [`Messaging`](#interface-messaging)
- [`ConfigDelegate`](#interface-configdelegate)
- [`ObjectSet`](#module-objectset)
- [`Helpers`](#module-helpers)

## Versioning of Thingpedia

The `thingpedia` module is versioned, and you can access the version that is loaded together with your interface using the `version` property on the module.

The version is an object with the following properties:

- `major`: major version, updated if there are incompatible changes to the APIs
- `minor`: minor version, updated for the new features and compatible API additions
- `valueOf()`: returns the version as a single number (for comparison purposes)

At the time of writing, the thingpedia package is at version 2.1.

## Class BaseDevice

The base class of all devices in Thingpedia.

### constructor

```javascript
constructor(engine : Engine, state : object)
```

Initialize the device. Commonly the constructor will set `this.name`,
`this.description` and `this.uniqueId` based on the data in `state`.

### property name

```javascript
this.name : string
```

A string that will be shown in the list of devices a user owns in 
[My Almond](https://almond.stanford.edu/me/) page.

A common way is to concatenate the device name and the user name
from the service. E.g., `this.name = "LinkedIn Account of %s".format(this.userName);`.

### property uniqueId

```javascript
this.uniqueId : string
```

A string that uniquely identifies the device instance in the
context of a given Almond; you are supposed to compute it based on the
state and set it at the end of your constructor.

A common way to compute an unique ID is to concatenate the kind, a dash, and
then some device specific ID, as in LinkedIn, it would be `"com.linkedin-" + this.userId`.

### property description

```javascript
this.description : string
```

A string that describe the purpose of the device, which will be shown in My Almond page.

### property descriptors

```javascript
this.descriptors : Array<string>
```

A list of _discovery descriptors_ (unique identifiers associated with a specific
discovery protocol) for this device.

See the [Guide to Authentication and Discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for further information.

### property isTransient

```javascript
this.isTransient : bool
```

Set this property to true to mark your device as _transient_. Transient devices are not saved to disk and disappear after the user restarts Almond.

Most developers should not mark their devices as transient.

### getter state

```javascript
get state() : object
```
 
An arbitrary serializable JS object with data you will need to
talk to the device - including IP address, OAuth tokens, variable portions
of API urls, etc.

### getter kind

```javascript
get kind() : string
```

The _primary kind_ associated with your device, e.g. `com.linkedin`.

### getter engine

```javascript
get engine() : Engine
```

Gives you access to the full [Engine API](#class-engine).

### method stateChanged

```javascript
function stateChanged()
```

If you change `this.state`, you must at some point call `this.stateChanged`
to preserve the modification to disk.

### method updateState

```javascript
function updateState(newState : object)
```

If the state changes outside of you, and you want to recompute state, you should override `updateState()` to handle the new state; the overriding
method should chain up (with `super.updateState(newState)`) as the first statement.

### method start

```javascript
function start() : Promise<any>
```

Called when the engine starts, or the device is configured the first time.
You can override this method to run any async initialization for your device, by returning a promise that is resolved when your device is ready.
The value that the promise resolves to is ignored.

### method stop

```javascript
function stop() : Promise<any>
```

Called when the engine stop, or the device is removed.
Override this method to undo any initialization that was done during `start()`,
and release all resources (e.g. timers, network connections) associated
with the device.

### method hasKind

```javascript
function hasKind(kind : string) : bool
```

Check if this device instance supports the given type.

The default implementation uses the metadata in Thingpedia.
You can override this method, but you are encouraged not to.

### method queryInterface

```javascript
function queryInterface(iface : string) : ?object
```

Request an _extension interface_ for this device instance; extension
interfaces are optional features that your device class supports; override this method if you have
any, otherwise the default implementation will always return `null`.

The most important extension interface is `subdevices`. If you implement it (i.e., you return anything that
is not `null`), your device is assumed to be a collection of related devices
(like a Nest Account or a Philips Hue bridge).
You must return an instance of [ObjectSet](#class-objectset)
containing the devices related to yours.
You are responsible for calling `objectAdded` and `objectRemoved` if related devices can appear and disappear dynamically.

### method checkAvailable

```javascript
function checkAvailable() : Promise<Availability>
```

Asynchronously check if the device is available (i.e. it is reachable given
the current network conditions).

You should override this method for physical devices, in particular those that that use local connectivity protocols. This method will not be called if you
choose a category other than “Physical device” in the manifest.

The default implementation returns `Availability.UNKNOWN`.

### static method runOAuth2

```javascript
function runOAuth2(engine : Engine, req : http.IncomingMessage|null) : Promise<any>
```

f your device can be instantiated with an OAuth-like flow (user clicks on a button, is redirected to a login page), this should be set to the handler. Despite the name, this is called also for OAuth 1.

See the [Guide to Authentication and Discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for further information.

### static method loadFromDiscovery

```javascript
function loadFromDiscovery(engine : Engine, publicData : object, privateData : object) : Promise<BaseDevice>
```

This method is called to initially load a device that supports local discovery (e.g. Bluetooth or UPnP).

See the [Guide to Authentication and Discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for further information.

### method completeDiscovery

```javascript
function completeDiscovery(delegate : ConfigDelegate)
```

This method is called on a partially initialized device instance to complete
interactive discovery.

If your device supports discovery, you must override this method and interact
with the user through the passed `delegate` to complete configuring the device.

See the [Guide to Authentication and Discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for further information.

### method updateFromDiscovery

```javascript
function updateFromDiscovery(privateData : object)
```

This method is called on a fully initialized device instance when the discovery
subsystem discovers the device again (e.g. the user asks for Bluetooth discovery
and a previously configured device is in range).

Override this method to update any stored information with the new values obtained from the discovery protocol.

See the [Guide to Authentication and Discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for further information.

## Enum Availability

- `UNAVAILABLE`: the device is not available (powered off or disconnected)
- `AVAILABLE`: the device is available (powered on, connected, and correctly configured)
- `OWNER_UNAVAILABLE`: the device belongs to a different Almond, or requires proxying through an Almond that is off or not connected
- `UNKNOWN`: it was not possible to determine whether the device is available

## Interface Messaging

The `Messaging` interface is an abstraction over multiple messaging systems, such as Omlet or Matrix.
It is used to implement Communicating Almond.

If you wish to implement a messaging device over which Communicating Almond can operate, you should
return an implementation of this interface from your `queryInterface()` method when called with interface
`messaging`.

### getter isAvailable

```javascript
get isAvailable() : bool
```

Returns true if a messaging account has been configured, false otherwise.

### get account

```javascript
get account() : string
```

Returns the protocol-specific account identifier for the currently configured messaging account.

### method start

```javascript
function start() : Promise<any>
```

Initialize the messaging capability. This method is a good place to connect to the upstream service and
start synchronizing messages and chat rooms.

### method stop

```javascript
function stop() : Promise<any>
```

Release any resource that was acquired during `start()`.

### method getIdentities

```javascript
function getIdentities() : Array<string>
```

Returns an array of all the identities (phone numbers and email addresses) associated with this account.
Each identity is a string of the form `phone:` or `email:` followed by the actual identity.

### method getFeedList

```javascript
function getFeedList() : Promise<Array<Messaging.Feed>>
```

Returns the list of all the feeds that the user is member of.

### method getFeed

```javascript
function getFeed(feedId : string) : Promise<Messaging.Feed|null>
```

Returns the feed associated with this identifier, or null if the identifier is not valid.

### method getFeedWithContact

```javascript
function getFeedWithContact(contactId : string) : Promise<Messaging.Feed>
```

Retrieve a conversation with the given contact (which should be an account identifier), or create one
if no conversation exists.

### method searchAccountByName

```javascript
function searchAccountByName(name : string) : Promise<Array<Messaging.User>>
```

Search the messaging service for all users with the given name.

### method getAccountForIdentity

```javascript
function getAccountForIdentity(identity : string) : Promise<Messaging.User>
```

Convert the identity string to an account for the service.

## Interface ConfigDelegate

The `ConfigDelegate` interface is implemented by Almond and passed to `completeDiscovery()` to configure
discovered devices interactively.

All methods in this class will throw an error with code `ECANCELLED` if the user cancels during configuration.

### method configDone

```javascript
function configDone()
```

Call this method when discovery is complete and the device is fully set up.

### method configFailed

```javascript
function configFailed(error : Error)
```

Call this method to fail configuration with an error.

### method confirm

```javascript
function confirm(question : String) : Promise<bool>
```

Asks the user a yes/no question. Returns true if the user answered yes, and false if the user answered no.

### method requestCode

```javascript
function requestCode(question : String) : Promise<string>
```

Asks the user a free-form question. No parsing is performed of the user input. Use this method to ask for a PIN or password (e.g. a Bluetooth pairing PIN).

## Module ObjectSet

The `ObjectSet` module contains interfaces to deal with sets of objects that can change dynamically and can be observed from outside.

Use this module to implement _collection devices_, such as hubs or accounts that host multiple devices.

## Class ObjectSet.Base

The `ObjectSet.Base` is the base class of all object sets.

### method objectAdded

```javascript
function objectAdded(object : object)
```

Report that the object was added to the set. An `ObjectSet` implementation must call this method any time an object is added.

### method objectRemoved

```javascript
function objectRemoved(object : object)
```

Report that the object was removed from the set. An `ObjectSet` implementation must call this method any time an object is removed.

### abstract method values

```javascript
function values() : Array<object>
```

Returns the array of values currently in this `ObjectSet`

### abstract method start

```javascript
function start() : Promise<any>
```

Start monitoring the underlying collection of objects.

### abstract method stop

```javascript
function stop() : Promise<any>
```

Stop monitoring the underlying collection of objects and release any resource acquired during `start()`.

## Class ObjectSet.Simple

A simple implementation of `ObjectSet.Base` for objects that can be identified by `uniqueId` (such as devices). Uses a `Map` as the backing store.

The following methods are available on top of the `ObjectSet.Base` interface:

### method addOne

```javascript
function addOne(object : object|Promise<object>) : Promise<undefined>
```

Add an object to the set. If called with a `Promise`, it will wait until the promise is resolved and then add the object.

The implementation calls `objectAdded` internally.

### method addMany

```javascript
function addOne(objects : Array<object|Promise<object>>) : Promise<undefined>
```

Convenience method over multiple `addOne()` calls

### method removeOne

```javascript
function removeOne(object : object)
```

Removes the given object from the set.

The implementation calls `objectRemoved` internally.

### method getById

```javascript
function getById(uniqueId : string) : object|undefined
```

Returns the object with the given `uniqueId`, or `undefined` if no such object exists.

### method removeById

```javascript
function removeById(uniqueId : string)
```

Removes the object with the given `uniqueId`, and calls `objectRemoved`.
Does nothing, silently, if no such object exists.

### method removeIf

```javascript
function removeIf(predicate : (object) => bool)
```

Remove all objects for which `predicate` returns true.

### method removeAll

```javascript
function removeAll()
```

Remove all objects in the set.

## Module Helpers

A collections of useful APIs.

- [`Http`](#module-helpers-http)
- [`OAuth2`](#module-helpers-oauth2)
- [`Content`](#module-helpers-content)
- [`Rss`](#module-helpers-rss)
- [`Xml`](#module-helpers-xml)
- [`PollingStream`](#class-helpers-pollingstream)

## Module Helpers.Http

The `Helpers.Http` module provides a fully-featured HTTP client. It extends the nodejs HTTP API
to support buffering, OAuth 2.0 authentication, 3xx redirect handling, better header handling, and a Promise-based API.

### function get

```javascript
function get(url : string, options : ?object) : Promise<string|[Buffer, string]>
```

Perform a buffered HTTP GET. `options` can contain the following:

- `auth : string`: the value of `Authorization` header
- `accept : string`: the value of `Accept` header
- `useOAuth2 : BaseDevice`: if set, the `Authorization` header will be computed for the passed device based on the OAuth 2.0 standard; using this option also enables automatic refresh token handling (if the refresh token exists). This option is ignored if `auth` is also set.
- `authMethod : string`: set this to override the prefix of the `Authorization` header; defaults to `Bearer`. This option is ignored unless `useOAuth2` is set.
- `user-agent : string`: set the `User-Agent` header; if unset a default user agent is used.
- `extraHeaders : Array<string>`: an array of other request headers to set
- `ignoreErrors : bool`: set to `true` to ignore errors (HTTP statuses 300 and higher); defaults to `false`
- `followRedirects : bool`: set to `false` to disable automatic handling of HTTP redirects (status 301, 302 and 303); defaults to `true`
- `raw : bool`: return the binary response body instead of converting to a string; defaults to `false`

If `options.raw` is set, returns a tuple of the response (as a `Buffer`) and the `Content-Type` header.
Otherwise, it returns the response body as a string.

If the HTTP request fails (returns a status code greater or equal to 300), the promise is rejected.
The resulting `Error` object will have a `code` property containing the actual HTTP status code.
If the HTTP status code is a redirect (between 300 and 399 inclusive), the `redirect` property
on the error will contain the value of the `Location` header.

### function post

```javascript
function post(url : string, data : string|Buffer, options : ?object) : Promise<string|[Buffer, string]>
```

Perform a buffered HTTP POST. `data` is the content of the request body; you can pass `null` for an empty body.

`options` accepts the same options as `get()` plus the following:

- `dataContentType : string`: the value of the `Content-Type` request headers

### function request

```javascript
function request(url : string, method : string, data : string|Buffer|null, options : ?object) : Promise<string|[Buffer, string]>
```

Perform a buffered HTTP request with a custom method. `data` and `options` are the same as `post()`.

### function postStream

```javascript
function postStream(url : string, data : stream.Readable, options : ?object) : Promise<string|[Buffer, string]>
```

Perform a streaming POST request. The response will be buffered as with `post()`.

### function getStream

```javascript
function getStream(url : string, options : ?object) : Promise<http.IncomingMessage>
```

Perform a streaming GET request. `options` at the same as `get()`, except `options.raw` is ignored.

The result is the [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_incomingmessage) from the underlying nodejs HTTP API. The result
is also a `stream.Readable` and can be used as such.

## Module Helpers.OAuth2

The `Helpers.OAuth2` module contains high-level helpers for APIs that conform to 
[RFC 6749](https://tools.ietf.org/html/rfc6749).

For documentation on these helpers, see the [Guide to Authentication and Discovery](/doc/thingpedia-device-intro-auth-n-discovery.md).

## Module Helpers.Content

The `Helpers.Content` module allows you to deal with URLs that might not be accessible publicly, such as `file://` or `content://` URL. It is useful to allow uploading of pictures that the user chose from their local device.

### function isPubliclyAccessible

```javascript
function isPubliclyAccessible(string : url) : bool
```

Returns true if the URL is publicly accessible (i.e. it can be accessed using the [HTTP helpers](#module-helpers-http), and false if the URL is local-only (e.g. a `file://` URL).

Note that this function does not attempt to resolve the URL, and will return `true` even if the URL is expired, invalid or requires authentication.

### function getStream

```javascript
function getStream(platform : Platform, string : url) : Promise<stream.Readable>
```

Stream the content of the given `url`. If `url` is an HTTP URL, it performs a streaming GET request with no authentication. Otherwise, it will load the URL using a platform specific method.

The resulting stream will have the `contentType` property set to the Content-Type of the stream.

### function getData

```javascript
function getData(platform : Platform, string : url) : Promise<Buffer>
```

Similar to `getStream`, but buffers the response into a single `Buffer`.

The resulting `Buffer` will have the `contentType` property set.

## Module Helpers.Rss

The `Helpers.Rss` module contains a simple RSS reader library, optimized to implement RSS based queries.

The library supports both RSS 1.0 and Atom formats.

### function get

```javascript
function get(url : string, options : ?object) : Promise<Array<RSSItem>>
```

Retrieves the RSS feed at `url`. `options` has the same meaning as [`Helpers.Http`](#module-helpers-http)`.get`.

The result `RSSItem` object has the following properties:

- `title`: the title of the post
- `link`: the URL of the post
- `updated_time`: the date at which the post was last updated (as a `Date` object)
- `description`: the description of the post
- `picture_url`: the main picture associated with the post, if any

If the RSS feed does not provide a value for any of these properties, the value will be empty.

The resulting array is sorted by `updated_time`, with most recently updated posts first.

## Module Helpers.Xml

### function parseString

```javascript
function parseString(xml : string) : Promise<object>
```

Parse the given `xml` document using [xml2js](https://www.npmjs.com/package/xml2js).

This module exists to expose the bundled xml2js dependency to Thingpedia interfaces, so that they don't need to bundle it themselves.

## Class Helpers.PollingStream

`Helpers.PollingStream` is an implementation of `stream.Readable` (in object mode) that will push a new result every time a timer fires.

This class is used to implement polling of queries, but can be useful in combination with a custom `subscribe_` implementation to have more control over the polling algorithm.

### constructor

```javascript
constructor(state : StateBinder, interval : number, callback : () => Promise<Array<object>>)
```

Create a new `PollingStream`. `state` should be the state parameter passed to the `subscribe_` method. `interval` is the polling interval in milliseconds.

`callback` is the actual polling callback. It will be called at most every `interval` milliseconds and is responsible for producing the new values in the stream.
If `callback` fails (throws or returns a rejected promise), the stream will emit an `error` event.

## Class Engine

`this.engine` on a device gives you access to the
[`Engine`](https://github.com/stanford-oval/thingengine-core/blob/master/lib/engine.js)
object, which is shared among all device instances, but private to a specific user.

The API on the `Engine` object is less stable than `Tp.BaseDevice`, but it is
nevertheless useful.

You cannot access the actual `Engine` class, and you cannot create new instances of this class.

### getter platform

```javascript
get platform() : Platform
```

Access the `Platform` instance for the current user.

### getter ownTier

```javascript
get ownTier() : string
```

The currently running tier of Almond, ie `cloud` or `phone`

### getter devices

```javascript
get devices() : DeviceDatabase
```

The database of all devices. The resulting object is a [`DeviceDatabase`](https://github.com/stanford-oval/thingengine-core/blob/master/lib/devices/database.js).

### getter apps

```javascript
get devices() : AppDatabase
```

The database of all long-running ThingTalk programs for the current user. The resulting object is a [`AppDatabase`](https://github.com/stanford-oval/thingengine-core/blob/master/lib/apps/database.js).

Use this object to run ThingTalk code.

### getter thingpedia

```javascript
get thingpedia() : ThingpediaClient
```

Provides access to a client side library to query the [Thingpedia API](/doc/thingpedia-api).

### getter stats

```javascript
get stats() : Preferences
```

Provides access to a `Preferences` store for usage statistics and tracking.

Data stored here should be assumed to be volatile and unreliable: the user might erase it at any time, and if the engine crashes there is no guarantee it will be persisted to disk.

## Class Platform

`this.engine.platform` gives you access to the Platform API, which allows you to interact with low-level features of the system hosting Almond.

Most of the API is for internal use only.

### getter type

```javascript
get type() : string
```

Returns the type of the platform. Known types are `android`, `gnome`, `cloud` and `server`, but
your code should be prepared to deal with unknown platform types, and should prefer using `hasCapability()` instead.

### getter locale

```javascript
get locale() : string
```

Returns the locale of the user, as a [BCP 47 Tag](https://tools.ietf.org/html/rfc5646). For example, `en-US` for American English, and `it-IT` for Italian.

Note: some platform code uses POSIX Locale identifiers instead. These are similar but use an underscore instead of a dash. Code should be prepared to handle both.

### getter timezone

```javascript
get timezone() : ?string
```

Get the timezone of the user. The format of the resulting timezone string is unspecified, but it is known to be ok to pass to `Date.toLocaleString()`.
Commonly, the timezone will be in POSIX format, e.g. `America/Los_Angeles`.

If the getter returns `null` or `undefined`, the code should use the operating system timezone.

### method hasFeature

```javascript
function hasFeature(feature : string) : bool
```

Check if the given Almond feature is enabled by this `Platform` and `Engine`.

Valid features are:
- `apps`: ThingTalk code execution is allowed
- `messaging`: messaging (Communicating Almond) is enabled
- `memory`: memory (storing of query history) is enabled
- `discovery`: device discovery is available
- `ml`: local machine learning (for personalization) is possible
- `permissions`: SMT-based access control checking for Communicating Almond is enabled

### method getPlatformDevice

```javascript
function getPlatformDevice() : ?string
```

Returns the identifier for a Thingpedia device that is tightly coupled with this platform.
The full device identifier is formed by concatenating `org.thingpedia.builtin.thingengine.` to the result of this method.

This method is called during engine initialization to enable builtin devices.

### method hasCapability

```javascript
function hasCapability(cap : string) : bool
```

Returns `true` if the platform has the specific capability, or `false` otherwise.

### method getCapability

```javascript
function getCapability(cap : string) : ?object
```

Returns the interface associated with the given capability. Will return `null` if the capability is not supported (`hasCapability(cap)` returns `false`), or the capability has no associated object.

### method getSharedPreferences

```javascript
function getSharedPreferences() : Preferences
```

Access an instance of [`Preferences`](https://github.com/stanford-oval/thingengine-core/blob/master/lib/util/prefs.js),
which is a Almond-wide store of key-value pairs backed to disk.

### method getWritableDir

```javascript
function getWritableDir() : string
```

Returns a filesystem path that is writable and suitable to contain long-term useful files (i.e. not caches).

### method getCacheDir

```javascript
function getCacheDir() : string
```

Returns a filesystem path that is writable and suitable for caching files.

### method getTmpDir

```javascript
function getTmpDir() : string
```

Returns a filesystem path that is writable and suitable for temporary files.

The path might be the same or different than the OS temporary directory which is
accessible as `os.tmpdir()`.

### method getSqliteDB

```javascript
function getSqliteDB() : string
```

Returns the filesystem path of the primary sqlite database (the one containing devices,
ThingTalk programs and other data that belongs to the user).

Use this database if you need a SQL-based local store.

### method getSqliteKey

```javascript
function getSqliteKey() : string
```

Returns the encryption key associated with the sqlite database returned by `platform.getSqliteDB()`.

If access the database directly, you must call this method and pass the encryption key to the database before using it, or any SQL query will fail.

### method getDeveloperKey

```javascript
function getDeveloperKey() : ?string
```

Returns the currently configured Thingpedia developer key, or `null` if none exists.

### method setDeveloperKey

```javascript
function setDeveloperKey(key : string) : bool
```

Changes the Thingpedia developer key, and returns `true` if the change actually happened.

Not all platforms support changing the developer key using this API; some will unconditionally return `false` and do nothing.

### method getOrigin

```javascript
function getOrigin() : ?string
```

Return the URL of the web site hosting this instance of Almond.

Use this URL for OAuth redirect URIs.

### method getCloudId

```javascript
function getCloudId() : ?string
```

Return the identifier of the user in Web Almond.

This identifier is used to synchronize the device database between different Almond installations.
