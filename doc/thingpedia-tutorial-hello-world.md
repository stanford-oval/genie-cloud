# Tutorial 1: Hello World

Welcome to Almond! This tutorial will get you started making your very first Almond device.

If you haven't signed up for a developer account, follow the instructions [here](/doc/getting-started.md) to create an account, then hurry back here!

## Step 1: set up your device
Go to the [Device Creation Page](/thingpedia/upload/create), fill in the following basic information 
about the device:

- ID: `<your-name>.hello` (Each device in Thingpedia needs an unique ID. Make sure your ID hasn't been used!)
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
Copy the following code to the editor and replace `<your-name>.hello` with the 
actual device ID:
```tt
class @<your-name>.hello {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  query greeting(in opt name: String,
              out reply: String)
  #_[confirmation="greeting"]
  #_[formatted=[{type="text",text="Hello ${reply}!"}]];
}

```

## Step 3: provide some natural language examples
Click on `dataset.tt` on the left panel. 
Copy the following code to the editor and replace `<your-name>.hello` with the 
actual device ID.
With queries, Almond learns to listen out for commands that goes 'get [something]'. With the `dataset.tt` here, Almond will learn two commands, 'get greeting' and 'get greeting for "[name]"' (note the quotation marks!).
```tt
dataset @<your-name>.hello {
  query  := @<your-name>.hello.greeting()
  #_[utterances=["greeting"]];

  query (p_name :String) := @<your-name>.hello.greeting(name=p_name)
  #_[utterances=["greeting for ${p_name}"]];
}
```

## Step 4: submit the device
Click the `Create` button at the top left corner to submit the device. 
Congratulation! You made your first device for Thingpedia!

You will see a banner that says "The natural language dataset for this device is being updated. You should wait before testing."

Please wait for a couple minutes until the banner disappears, so that Almond can learn the natural language examples in your `dataset.tt` file.

## Try your device
Go to [My Almond](/me), then try commands such as `get greeting` and `get greeting for "bob"` (note the quotation marks!).

Good job making your first Almond device!
