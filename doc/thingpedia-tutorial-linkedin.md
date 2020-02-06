# Tutorial 4: LinkedIn

In the last two tutorials, we have worked on two public services.
In this tutorial, we will create a personal device: LinkedIn.
It allows users to link their own LinkedIn accounts by OAuth and publish posts on LinkedIn.

## Step 1: Create a LinkedIn app

Go to the [LinkedIn Developers Page](https://www.linkedin.com/developers/) and click on the big "Create App" button. Then fill in the required information about your app and submit by clicking on "Create app". You've just created a LinkedIn app!

On your app page, click on the "Auth" tab and take note of the Client ID and Client Secret. We will need these later!

On the same "Auth" tab, under OAuth 2.0 Settings, add the following URL

`https://thingengine.stanford.edu/devices/oauth2/callback/<your-name>.linkedin`

where `<your-name>.linkedin` is the name of your Almond device.

## Step 2: set up your device on Almond
Go to the [Device Creation Page](/thingpedia/upload/create), fill in the following basic information 
about the device:

- ID: `<your-name>.linkedin` (This must be unique and the same as what you have in step 1)
- Name: `My LinkedIn` (This should also be unique so that it's easy to find!)
- Description: `LinkedIn Account in Almond`
- Category: `Social Network`
- Icon: choose a PNG file you like (512x512 resolution is recommended)
- JS code: upload a file named `index.js` with the following code (remember to replace `<your-name>.linkedin` with your device's ID)
```javascript
"use strict";

const Tp = require('thingpedia');

const PROFILE_URL = 'https://api.linkedin.com/v2/me';
const SHARE_URL = 'https://api.linkedin.com/v2/ugcPosts';

module.exports = class LinkedinDevice extends Tp.BaseDevice {
    /*
    runOAuth2 specifies how the authentication works in detail 
    */
    static get runOAuth2() {
        return Tp.Helpers.OAuth2({
            scope: ["r_emailaddress","r_liteprofile","w_member_social"],
            authorize: 'https://www.linkedin.com/oauth/v2/authorization',
            get_access_token: 'https://www.linkedin.com/oauth/v2/accessToken',
            set_state: true,

            callback(engine, accessToken, refreshToken) {
                const auth = 'Bearer ' + accessToken;
                return Tp.Helpers.Http.get(PROFILE_URL,
                                           { auth: auth,
                                             accept: 'application/json' }).then((response) => {
                    const parsed = JSON.parse(response);
                    return engine.devices.loadOneDevice({ kind: '<your-name>.linkedin',
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
    A user might have multiple accounts for LinkedIn.
    Thus we need to have an unique ID to identify different instances of the class.
    And optionally, we give each instance a different name and description, so
    that users can easily tell which account a device instance associates with 
    in their device list. 
    */
    constructor(engine, state) {
        super(engine, state);
        // This is the actual device name that will appear on your user's Almond
        this.uniqueId = 'com.linkedin-' + this.state.userId;
        this.name = "LinkedIn Account of %s".format(this.state.userName);
        this.description = "This is your LinkedIn account";
    }
    
    /*
    An action function called "share"
    The "do_" prefix indicates this is an action, not a query

    This allows Almond to help your user share a post on LinkedIn!
    */
    do_share({ content }) {
        /* 
        Send an HTTP POST request to SHARE_URL with the data we want to post.
        Options include the auth information, the format of the data, and the expected output type 
        */
        return Tp.Helpers.Http.post(SHARE_URL, JSON.stringify({
            "author": "urn:li:person:" + this.state.userId,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {
                        "text": content
                    },
                    "shareMediaCategory": "NONE"
                }
            },
            "visibility": {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
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

## Step 3: describe what your device does
Click on `manifest.tt` on the left panel. 
Copy the following code to the editor and replace `<your-name>.linkedin` with the 
actual device ID. Also, replace `<your-client-id>` and `<your-client-secret>` with the Client ID and Client Secret from your LinkedIn app's Auth page.
```tt
class @<your-name>.linkedin {
  // tell the system this device uses customized js code
  import loader from @org.thingpedia.v2();
  // tell the system this device uses OAuth2
  import config from @org.thingpedia.config.oauth2(client_id=<your-client-id>, client_secret=<your-client-secret>);

  /* 
    The function to post on LinkedIn.
    Example commands: "post on LinkedIn"
  */
  action share(in req status: String #_[prompt="What do you want to post?"])
  #_[confirmation="share $status on your LinkedIn"]
  #[doc="share a comment and a link "];
}
```

## Step 4: provide some natural language examples
Click on `dataset.tt` on the left panel. 
Copy the following code to the editor and replace `<your-name>.linkedin` with the 
actual device ID:
```tt
dataset @<your-name>.linkedin {
  action (p_status :String)  := @<your-name>.linkedin.share(status=p_status)
  #_[utterances=["share $p_status on linkedin","post $p_status on linkedin"]];

  action  := @<your-name>.linkedin.share()
  #_[utterances=["update my linkedin","post something on my linkedin"]];
}
```

## Step 5: submit the device
Click the `Create` button at the top left corner to submit the device. 
Congratulation! You made a LinkedIn device for Thingpedia. 
Go to [Thingpedia page](/thingpedia) and search for your device name to see your device.

## Try your device
Go to [My Almond](/me). 
Click on [Configure new skill](/me/devices/create) under "Enabled Skills" and then on your device's name. 
You should be immediately directed to the LinkedIn OAuth page.

After you log in to LinkedIn and grant permission, you will be redirected to your
Almond page, which now includes the LinkedIn skill!

Similar to previous tutorials,
please wait for a couple minutes until the banner disappears.
Then try commands such as `get my LinkedIn profile`, `update my LinkedIn`. 

Note that at this point, the natural language support is very limited. 
If you want to train the full model, click on the `Start training` button at the bottom 
of the details page of your device to start a new training job. The training will take up to 12 hours.   
