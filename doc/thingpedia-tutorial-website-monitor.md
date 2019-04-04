# Tutorial 3: Class Website Monitor

In this tutorial, we will create a device which monitor the changes of a class website. 
We will use the Stanford CS294S website as an example and allow student to use this device to monitor updates 
on the class materials. 
This can be applied to any static element in the website, and can be used for various applications 
such as monitor price and availability changes of a product, new announcement. 

## Step 1: set up your device
Go to the [Device Creation Page](/thingpedia/upload/create), fill in the following basic information 
about the device:

- ID: `<your-name>.edu.stanford.cs294s` (Each device in Thingpedia needs an unique ID, so use your name or email address 
in the device name to make sure it won't conflict with others)
- Name: `My CS294S`
- Description: `Retrieve class materials and get notification for updates`
- Category: `Media`
- Icon: choose a PNG file you like (512x512 resolution is recommended)
- JS code: upload a zip file containing `index.js` with the following code.

```javascript
"use strict";

const Tp = require('thingpedia');
const url = 'https://web.stanford.edu/class/cs294s/';
const cheerio = require('cheerio');

module.exports = class CS294S extends Tp.BaseDevice {
    get_slides() {
        return Tp.Helpers.Http.get(url).then((res) => {
            // we use cheerio to parse the html and retrieve the href of the element with class "class_slides"
            // note that this will only work if the website is static.
            const $ = cheerio.load(res);
            const output = [];
            $('.class_slides').each((i, slides) => {
                output.push({ link: url + $(slides).attr('href') });
            });

            return output;
        });
    }
};
```

Note that in this example, we use the `cheerio` library to extract the elements we need from the html file. 
Thus, we need to upload a zip file containing all the required dependencies, instead of a single JavaScript file. 

The zip file should include `index.js`, a `package.json` and a folder `node_modules` which contains the dependencies. 
To create `package.json`, you can use either `npm` or `yarn`. 
You can find how to create it from 
[here](https://docs.npmjs.com/creating-a-package-json-file) (with `npm`) 
and [here](https://yarnpkg.com/lang/en/docs/creating-a-package/) (with `yarn`).
Once the `package.json` is created, you can run `npm install cheerio --save` or `yarn add cheerio` to 
install the dependencies, and this will create the `node_modules` folder. 

Now you can create the zip file.
We recommend to use command line to compress the folder
`zip -r xx.zip your-folder-name`. 
Compressing from the right-click menu in Mac will create a new folder which 
makes the system fail to find the files in the root directory.

## Step 2: describe what your device does
Click on `manifest.tt` on the left panel. 
Copy the following code to the editor and replace `<your-name>.edu.stanford.cs294s` with the 
actual device ID:
```tt
class @<your-name>.edu.stanford.cs294s {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  monitorable query slides(out link: Entity(tt:url))
  #_[canonical="cs294s slides"]
  #_[confirmation="cs294s sides"]
  #_[formatted=[{type="rdl",webCallback="${link}",displayTitle="${link}"}]]
  #[poll_interval=60min]
  #[doc="retrieve the link of slides from cs294s class website"];
}

```

## Step 3: provide some natural language examples
Click on `dataset.tt` on the left panel. 
Copy the following code to the editor and replace `<your-name>.edu.stanford.cs294s` with the 
actual device ID:
```tt
dataset @<your-name>.edu.stanford.cs294s language "en" {
    query  := @edu.stanford.cs294s.slides()
    #_[utterances=["cs294s class slides"]];

    stream  := monitor (@edu.stanford.cs294s.slides())
    #_[utterances=["when new slides are added to cs294s website"]];
}
```

## Step 4: submit the device
Click the `SAVE` button at the top left corner to submit the device. 
Now you have a device for class CS294s at Stanford (It is a great class by the way. You should take it 
if you are a Stanford student.) 
Go to [Thingpedia page](/thingpedia) and search for "My CS294S" to see your device.

## Try your device
Similar to [Tutorial 1](/doc/thingpedia-tutorial-nyt.md) and [Tutorial 2](/doc/thingpedia-tutorial-cat.md),
please wait for a couple minutes until the banner disappears.
Then try commands such as `get cs294s class slides`, `notify me when new slides are added to cs294s website`. 

Note that at this point, the natural language support is very limited. 
If you want to train the full model, click on the `Start training` button at the bottom 
of the details page of your device to start a new training job. The training will take up to 27 hours.   
