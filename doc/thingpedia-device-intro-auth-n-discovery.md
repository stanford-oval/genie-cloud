# Guide to Authentication and Discovery

[[toc]]

## Handling Authentication

### Different types of authentication

Most devices will require some kind of authentication, for example a password or an OAuth 2.0
access token. After the device is set up and stored to disk, this is easy because you have
the authentication data, but you need a way to obtain it at first.

The way it is handled is through the `Authentication` field in the _manifest file_.
Three ways to do authentication are supported:

- `none`: means that the device has no authentication at all, it only uses publicly available APIs;
the resulting configuration UI will be a single button (unless you need other data,
in which case it will be a form); in this case you have nothing to do
- `basic`: traditional username and password; your state must contain `username` and `password`
properties, which are set to the values provided by the user through a form. An example can be found 
[here](https://almond.stanford.edu/thingpedia/upload/example/3).
- `oauth2`: OAuth 1.0 and 2.0 style authentication; the user clicks and is redirected to a login
page, then the login page redirects back to ThingEngine giving you the authorization code
- `discovery`: authentication by discovery and local interactive pairing
- `builtin`: for internal use only

### `oauth2` authentication helpers

As mentioned before, despite the name, `oauth2` is the authentication type of
all OAuth style schemes. But if you use exactly OAuth 2.0 as specified in
[RFC 6749](https://tools.ietf.org/html/rfc6749), which some services do, you
can use a shorter helper:

```javascript
static get runOAuth2() {
    return Tp.Helpers.OAuth2({
        kind: "com.example",
        client_id: "your_oauth2_client_id",
        client_secret: "your_oauth2_client_secret_obfuscated_as_rot13",
        authorize: "https://api.example.com/1.0/authorize",
        scope: ['example_user_profile', 'example_basic_info']
        get_access_token: "https://api.example.com/1.0/token",
        callback: function(accessToken, refreshToken) { /* add device here */ }
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

NOTE: the JS code will be publicly available, so do not put sensitive information in the code. 
To add client id and client secret, add the corresponding properties in the `Authentication` field 
in the manifest. An example can be found [here](https://almond.stanford.edu/thingpedia/upload/example/9). 

### `oauth2` authentication the slow way

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





## Handling Discovery

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

### Bluetooth discovery

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
