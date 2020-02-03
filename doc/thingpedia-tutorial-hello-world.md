# Tutorial 0: Hello World

Welcome to Almond! This tutorial will get you started making your very first Almond device. 

## Step 1: set up your device
Go to the [Device Creation Page](/thingpedia/upload/create), fill in the following basic information 
about the device:

- ID: `hello.<your-name>` (Each device in Thingpedia needs an unique ID. Make sure your ID hasn't been used!)
- Name: `Hello <your-name>` (The device name does not have to be unique, but making it unique means it is easier to find!)
- Description: `My very first device`
- Category: `Other`
- License: `MIT` or any appropriate license
- Icon: choose any PNG file you like (512x512 resolution is recommended)
- JS code: upload a file named `index.js` with the following code.
```javascript
"use strict";

const Tp = require('thingpedia');

module.exports = class MyFirstDevice extends Tp.BaseDevice {
    // A simple query function called "greeting"
    // Query functions must be in the form "get_<something>",
    // where <something> matches the query name in manifest.tt
    get_greeting({ name }) { // `name`` is an optional parameter (see manifest.tt)
        // All queries should return an array of objects
        // The object has properties corresponding to the outputs
        // declared in manifest.tt
        if (name) return [{ reply: name }];
        else return [{ reply: 'world' }];
    }
};
```

## Step 2: describe what your device does
Click on `manifest.tt` on the left panel. 
Copy the following code to the editor and replace `hello.<your-name>` with the 
actual device ID:
```tt
class @hello.<your-name> {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  query greeting(in opt name: String #_[canonical="name"],
              out reply: String #_[canonical="reply"])
  #_[confirmation="greeting"]
  #_[formatted=[{type="text",text="Hello ${reply}!"}]];
}

```

## Step 3: provide some natural language examples
Click on `dataset.tt` on the left panel. 
Copy the following code to the editor and replace `hello.<your-name>` with the 
actual device ID.
With queries, Almond learns to listen out for commands that goes 'get <something>'. With the `dataset.tt` here, Almond will learn two commands, 'get greeting' and 'get greeting for "<name>"'.
```tt
dataset @hello.<your-name> {
  query  := @hello.<your-name>.greeting()
  #_[utterances=["greeting"]];

  query (p_name :String) := @hello.<your-name>.greeting(name=p_name)
  #_[utterances=["greeting for ${p_name}"]];
}
```

## Step 4: submit the device
Click the `Create` button at the top left corner to submit the device. 
Congratulation! You made your first device for Thingpedia!

You will see a banner that says "The natural language dataset for this device is being updated. You should wait before testing."

Please wait for a couple minutes until the banner disappears, so that Almond can learn the natural language examples in your `dataset.tt` file.

## Try your device
Go to [My Almond](/me). 
Click on [Configure new skill](/me/devices/create) under "Enabled Skills" and then on your device's name.
Then try commands such as `get greeting` and `get greeting for "bob"`.

Good job making your first Almond device!
