# Tutorial 2: The Cat API
In this tutorial, you will create a device for 
[The Cat API](https://thecatapi.com/) in Thingpedia.
It gives you cute cat pictures! 

## Step 1: setting up your device
Go to the [Device Creation Page](/thingpedia/upload/create), fill in the following basic information 
about the device:
- ID: `<your-name>.thecatapi` (Each device in Thingpedia needs an unique ID, so use your name or email address 
in the device name to make sure it won't conflict with others)
- Name: `My Cat API`
- Description: `Where everyday is Caturday`
- Category: `Media`
- Icon: choose a PNG file you like (512x512 resolution is recommended)
- JS code: upload a file named `index.js` with the following code.

```javascript
"use strict";

const Tp = require('thingpedia');

const URL = 'http://thecatapi.com/api/images/get?api_key=<YOUR-API-KEY>&format=xml&type=jpg,png';

module.exports = class CatAPIDevice extends Tp.BaseDevice {
    constructor(engine, state) {
        super(engine, state);

        this.uniqueId = 'com.thecatapi';
        this.name = "The Cat API";
        this.description = "Where every day is Caturday!";
    }

    get_get({ count }) {
        count = count || 1;
        const url = URL + '&results_per_page=' + count;
        return Tp.Helpers.Http.get(url).then((result) => Tp.Helpers.Xml.parseString(result))
        .then((parsed) => {
            const array = parsed.response.data[0].images[0].image;
            return array.map((image) => {
                return { image_id: image.id[0], 
                         picture_url: image.url[0],
                         link: 'http://thecatapi.com/?id=' + image.id[0] };
            });
        });
    }
};
``` 

## Step 2: describing what your device does
Click on `manifest.tt` on the left panel. Copy the following code to the editor.
```tt
class @com.thecatapi {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  list query get(in opt count: Number,
            out image_id: Entity(com.thecatapi:image_id),
            out picture_url: Entity(tt:picture),
            out link: Entity(tt:url))
  #_[canonical="get cat on thecatapi"]
  #_[confirmation="cat pictures"]
  #[doc="get `count` many cat pictures"];
}
```

## Step 3: providing some natural language examples
Click on `dataset.tt` on the left panel. Copy the following code to the editor
```tt
dataset @com.thecatapi {
    query  := @com.thecatapi.get()
    #_[utterances=["a cat picture","a random cat picture","cats"]];

    query (p_count :Number)  := @com.thecatapi.get(count=p_count)
    #_[utterances=["${p_count:const} cat pictures"]];
}
```

## Step 4: submitting the device
Click the `SAVE` button at the top left corner to submit the device. 
Congratulation! You made yourself a cat device in Thingpedia. 
Go to [Thingpedia page](/thingpedia) and search for "cat" to see your device.

## Try your device
Go to [My Almond](/me). Type in `get cats`. 