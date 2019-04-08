# Guide to Authentication and Discovery

[[toc]]

## Different types of authentication

Most devices require some kind of authentication, for example a password, an OAuth 2.0
access token, or local interactive pairing via some protocol. 
Developers can specify how the device should be configured in the device class
by import `config` module from the following supported mixins:

- `@org.thingpedia.config.none`: for devices with no authentication at all
- `@org.thingpedia.config.form`: for devices with no authentication but require extra information from the user to configure
- `@org.thingpedia.config.basic_auth`: for devices that use traditional username and password
- `@org.thingpedia.config.oauth2`: for OAuth 1.0 and 2.0 style authentication
- `@org.thingpedia.config.discovery.upnp`: for authentication by discovery and local interactive pairing via UPnP protocol 
- `@org.thingpedia.config.discovery.bluetooth`: for authentication by discovery and local interactive pairing via Bluetooth protocol 

### Device with no authentication
Some public services require no authentication to request for data.
In this case, no `config` module needs to be imported for the device explicitly 
and the one from `@org.thingpedia.config.none` will be automatically used. 

If an API key is required, you can specify it as follows 
```tt
import config from @org.thingpedia.config.cone(api_key=<your-api-key>);
```

If some other information is required from the user, you can use the `config`
module from `@org.thingpedia.config.form`, where you can define the configuration parameters
you need. 
For example, in [RSS feed](https://almond.stanford.edu/thingpedia/upload/update/org.thingpedia.rss),
users can type in the URL of the RSS feed when they configure the device. 
It imports the `config` module as follows:
```tt
import config from @org.thingpedia.config.form(params=makeArgMap(name:String, url:String));
```

### Username and password
If a device does not provide an OAuth interface, a traditional username/password method 
is supported. It can be considered as a special case of `@org.thingpedia.config.form`
with two fields builtin: `username` and `password`. If needed, additional parameters can be specified 
with `extra_params`:
```tt
import config from @org.thingpedia.config.basic_auth(extra_params=makeArgMap(...))
```
Note: this is not recommended if OAuth is available. 

### OAuth
Most of the online accounts use OAuth nowadays. 
The `config` can be imported as follows:
```tt
import config from @org.thingpedia.config.oauth2(client_id=<your-client-id>, client_secret=<your-client-secret>);
```

#### `oauth2` authentication helpers

As mentioned before, despite the name, `oauth2` is the authentication type of
all OAuth style schemes. But if you use exactly OAuth 2.0 as specified in
[RFC 6749](https://tools.ietf.org/html/rfc6749), which some services do, you
can use a shorter helper:

```javascript
static get runOAuth2() {
    return Tp.Helpers.OAuth2({
        authorize: "https://api.example.com/1.0/authorize",
        get_access_token: "https://api.example.com/1.0/token",
        scope: ['example_user_profile', 'example_basic_info'],
        callback: function(engine, accessToken, refreshToken) { /* add device here */ }
    });
}
```

Here is an example from LinkedIn device in Thingpedia:
```javascript
static get runOAuth2() {
    return Tp.Helpers.OAuth2({
        authorize: 'https://www.linkedin.com/uas/oauth2/authorization',
        get_access_token: 'https://www.linkedin.com/uas/oauth2/accessToken',
        set_state: true,

        callback(engine, accessToken, refreshToken) {
            const auth = 'Bearer ' + accessToken;
            return Tp.Helpers.Http.get('https://api.linkedin.com/v1/people/~:(id,formatted-name)?format=json',
                                       { auth: auth,
                                         accept: 'application/json' }).then((response) => {
                const parsed = JSON.parse(response);
                return engine.devices.loadOneDevice({ kind: 'com.linkedin',
                                                      accessToken: accessToken,
                                                      refreshToken: refreshToken,
                                                      userId: parsed.id,
                                                      userName: parsed.formattedName
                                                    }, true);
            });
        }
    });
}
```



#### `oauth2` authentication the slow way

If your device uses OAuth-style authentication that is different from RFC 6749, 
you must implement `runOAuth2` in your
device class.

This method will be called twice: the first time, the `req` argument (the second argument
to your function) will be `null`. You must do whatever preparation to access the remote
service and return a [Promise](https://www.promisejs.org/) of an array with two elements:

- first element is the full redirect URI of the authentication page
- second element is an object with any value you want to store in the user session

The OAuth call should be set to redirect to `platform.getOrigin() +
'/devices/oauth2/callback/' + `_your kind_. This means that you should
add `http://127.0.0.1:8080`, `http://127.0.0.1:3000` and
`https://thingengine.stanford.edu` as acceptable redirects in the
service console if the service has redirect URI validation.

In pseudo code, the first call looks like:

```javascript
runOAuth2(engine, req) {
    if (req === null) {
        return prepareForOAuth2().then(function() {
            return ['https://api.example.com/1.0/authorize?redirect_uri=' +
                    platform.getOrigin() + '/devices/oauth2/callback/com.example',
                    { 'com-example-session': 'state' }];
        });
    } else {
        // handle the second phase of OAuth
    }
}
```

The second time, `runOAuth2` will be called with `req` set to a sanitized version of
the callback request generated by the service. Use `req.query` to access the query part
of the URL, `req.session` to read (but not write) the session.

During the second call, you can use the authentication code produced by the callback
to obtain the real access token, and then save it to the database. In pseudo-code:

```javascript
runOAuth2(engine, req) {
    if (req === null) {
        // handle the first phase of OAuth
    } else {
        if (req.session['com-example-session'] !== 'state')
            throw new Error('Invalid state');
        return getAccessToken(req.query.code).then(function(accessToken, refreshToken) {
            return getProfile(accessToken).then(function(profile) {
                return engine.devices.loadOneDevice({ kind: 'com.example',
                                                      accessToken: accessToken,
                                                      userId: profile.id });
            });
        });
    }
}
```





### Local discovery

Local discovery in Thingpedia relies on the
[thingpedia-discovery](https://github.com/Stanford-IoT-Lab/thingpedia-discovery)
nodejs module, which contains the generic code to run the discovery protocols and
to match the discovery information to a specific interface.

If your interface supports discovery, your must implement the
`UseDiscovery(publicData, privateData)` device class method. `publicData` and
`privateData` are objects that contain information derived from the discovery
protocol, and are discovery protocol specific; `privateData` contains user
identifying information (such as serial numbers and HW addresses), while `publicData`
contains the generic capabilities inferred by discovery and is sent to Thingpedia
to match the interface. `publicData.kind` is the identifier for the discovery
protocol in use.

The return value from `UseDiscovery` should be an instance of your device class
appropriately configured. This device will not be used (and will not be initialized)
until the user confirms the configuration.

You must also implement `completeDiscovery(delegate)`, which will be invoked when the
user clicks on your device among the many discovered. The delegate object provided
is a way to interact with the user. It has the following methods:

- `configDone()`: tell the user that configuration is complete
- `confirm(question)`: ask the user a yes or no question, for example to confirm a
   pairing code
- `requestCode(question)`: request a free-form response from the user, for example
   a password or PIN code
- `configFailed(error)`: report a failure to pair

The usual template for a `completeDiscovery` implementation will thus be:

```javascript
    completeDiscovery: function(delegate) {
    	return this.service.pair().then(function(code) {
    	    return delegate.confirm("Does the code %s match what you see on the device?".format(code));
    	}).then(function(confirmed) {
    	    if (confirmed) {
    	    	return this.service.confirm().then(function() {
    	    	    this.engine.devices.addDevice(this);
    	    	}.bind(this));
    	    } else {
    	    	return delegate.confirmFailed(new Error("Unable to verify pairing code"));
    	    }
    	}.bind(this));
    }
```

Furthermore, your device should implement `updateFromDiscovery(publicData, privateData)`,
which is called when a device that was already configured is rediscovered. You
can use this method to update any cached data about the device based on the
new advertisement, for example to update the Bluetooth alias.

Finally, your device must set `this.descriptors` to a list of protocol specific
device descriptors that will help the generic code recognize if a device was
already configured or not, and must set `state.discoveredBy` to `engine.ownTier`.

#### Bluetooth discovery

Discovery data:

- `publicData.kind`: `bluetooth`
- `publicData.uuids`: array of lower case Bluetooth UUIDs
- `publicData.class`: the numeric Bluetooth class
- `privateData.address`: lower case canonical Bluetooth HW address
- `privateData.alias`: Bluetooth alias (human readable name)
- `privateData.paired`: if Bluetooth pairing happened already
- `privateData.trusted`: if the device is trusted to access services on the host
- `descriptor`: `bluetooth/` followed by the HW address

Thingpedia matching of interfaces is based on UUIDs.
If your interface wants to be a candidate for any device with a given UUID, it
should expose the type `bluetooth-uuid-`_uuid_, e.g. an interface implementing
the A2DP sink profile  would mark itself
with type `blueooth-uuid-000110b-0000-1000-8000-00805f9b34fb`.

The bluetooth class is used as a fallback, and an interface can expose the types
`bluetooth-class-health` for Bluetooth class `0x900`, `bluetooth-class-audio-video`
for Bluetooth class `0x400` and `bluetooth-class-phone` for Bluetooth class `0x200`.
Other Bluetooth classes are ignored.
