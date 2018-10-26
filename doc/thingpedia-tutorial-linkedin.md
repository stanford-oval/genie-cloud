# Tutorial 3: LinkedIn

In the last two tutorials, we have worked on two public services, New York Times and The Cat API.
In this tutorial, we will create a personal device: LinkedIn.
It allows users to link their own LinkedIn accounts by OAuth, query their own LinkedIn
profiles, and publish posts on LinkedIn.

## Step 1: set up your device
Go to the [Device Creation Page](/thingpedia/upload/create), fill in the following basic information 
about the device:

- ID: `<your-name>.linkedin` (Each device in Thingpedia needs an unique ID, so use your name or email address 
in the device name to make sure it won't conflict with others)
- Name: `My LinkedIn`
- Description: `LinkedIn Account in Almond`
- Category: `Social Network`
- Icon: choose a PNG file you like (512x512 resolution is recommended)
- JS code: upload a file named `index.js` with the following code.
```javascript
"use strict";

const Tp = require('thingpedia');

const PROFILE_URL = 'https://api.linkedin.com/v1/people/~:(id,formatted-name,headline,industry,specialties,positions,picture-url)?format=json';
const SHARE_URL = 'https://api.linkedin.com/v1/people/~/shares?format=json';

module.exports = class LinkedinDevice extends Tp.BaseDevice {
    /*
    runOAuth2 specifies how the authentication works in detail 
    */
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

    /* 
    A user might have multiple accounts for non-public services and devices.
    Thus we need to have an unique ID to identify different instances of the class.
    And optionally, we give each instance a different name and description, so
    that users can easily tell which account a device instance associates with 
    in their device list. 
    */
    constructor(engine, state) {
        super(engine, state);

        this.uniqueId = 'com.linkedin-' + this.state.userId;
        this.name = "LinkedIn Account of %s".format(this.state.userName);
        this.description = "This is your LinkedIn account";
    }

    /*
    A query function called "get_profile"
    The "get_" prefix indicates this is a query, not an action
    */
    get_get_profile() {
        /* 
        Tp.Helpers.Http provides wrappers for nodejs http APIs with a Promise interface.
        In this case an HTTP GET request is sent to PROFILE_URL
        with the options including the auth information and expected output type,
        and then returns a Promise of the response.
        */
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
    
    /*
    An action function called "share"
    The "do_" prefix indicates this is an action, not a query
    */
    do_share({ status }) {
        /* 
        Send an HTTP POST request to SHARE_URL with the data we want to post.
        Options includes the auth information, the format of the data, and expected output type 
        */
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
References: 
[Node.js HTTP APIs](https://nodejs.org/api/http.html), 
[Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise),
[Array.prototype.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map).

## Step 2: describe what your device does
Click on `manifest.tt` on the left panel. Copy the following code to the editor:
```tt
class @com.linkedin {
  // tell the system this device uses customized js code
  import loader from @org.thingpedia.v2();
  // tell the system this device uses OAuth2
  import config from @org.thingpedia.config.oauth2(client_id=<your-client-id>, client_secret=<your-client-secret>);

  /* 
    The function to return the user's profile from LinkedIn.
    Example commands: "get my LinkedIn profile"
    Qualifiers: 
      - monitorable: if you want the query to be monitored and trigger actions on change
      - list: if the query returns multiple results  
  */
  monitorable query get_profile(out formatted_name: String,
                                out headline: String,
                                out industry: String,
                                out specialties: String,
                                out positions: Array(String),
                                out profile_picture: Entity(tt:picture))
  #_[confirmation="your LinkedIn profile"]
  #_[formatted=[{type="text",text="${formatted_name}"}, {type="text",text="${headline}"}, {type="picture",url="${profile_picture}"}, {type="text",text="Works in ${industry}"}]]
  #[poll_interval=86400000ms]
  #[doc="retrieve your LinkedIn profile"];

  /* 
    The function to post on LinkedIn.
    Example commands: "post on LinkedIn"
  */
  action share(in req status: String #_[prompt="What do you want to post? Include a link to a page."])
  #_[confirmation="share $status on your LinkedIn"]
  #[doc="share a comment and a link "];
}
```

## Step 3: provide some natural language examples
Click on `dataset.tt` on the left panel. Copy the following code to the editor:
```tt
dataset @com.linkedin language "en" {
  query  := @com.linkedin.get_profile()
  #_[utterances=["my linkedin profile","my profile on linkedin"]];

  action (p_status :String)  := @com.linkedin.share(status=p_status)
  #_[utterances=["share $p_status on linkedin","post $p_status on linkedin"]];

  action  := @com.linkedin.share()
  #_[utterances=["update my linkedin","post something on my linkedin"]];
}
```

## Step 4: submit the device
Click the `SAVE` button at the top left corner to submit the device. 
Congratulation! You made a LinkedIn device for Thingpedia. 
Go to [Thingpedia page](/thingpedia) and search for "my LinkedIn" to see your device.

## Try your device
Go to [My Almond](/me). 
Click on [Add New Account](/me/devices/create?class=online)
and then on "My LinkedIn". Note that there is already a "LinkedIn Account" created 
in Thingpedia. To test the device you just created, use "My LinkedIn" instead of "LinkedIn Account". 

After you log in to LinkedIn and grant permission, you will be redirected to your
Almond page, which now includes LinkedIn.

Try commands such as `get my LinkedIn profile`, `post hello on LinkedIn`. 