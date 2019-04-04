# Tutorial 2: The Cat API
In this tutorial, you will create a device for 
[The Cat API](https://thecatapi.com/) in Thingpedia.
It gives you cute cat pictures! 
Since the API returns results in XML format instead of JSON,
a Javascript package is needed to process the data. 

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
    /* 
    A query function called "get", which returns $count number of cat pictures
    the "get" before the underscore tells the system this is a "query" function instead of an "action" function
    the "get" after the underscore indicates the name of the function
    */
    get_get({ count }) {
        count = count || 1;
        const url = URL + '&results_per_page=' + count;
        // Tp.Helpers.Http provides wrappers for nodejs http APIs with a Promise interface
        // In this case an HTTP GET request is sent and it returns a Promise of the result
        return Tp.Helpers.Http.get(url).then((result) => Tp.Helpers.Xml.parseString(result))
        .then((parsed) => {
            const array = parsed.response.data[0].images[0].image;
            // All queries always return an array. Here we use Array.prototype.map() to create a new Array
            return array.map((image) => {
                return { image_id: image.id[0], 
                         picture_url: image.url[0],
                         link: 'http://thecatapi.com/?id=' + image.id[0] };
            });
        });
    }
};
``` 
References: 
[Node.js HTTP APIs](https://nodejs.org/api/http.html), 
[Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise),
[Array.prototype.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map).

## Step 2: describing what your device does
Click on `manifest.tt` on the left panel. 
Copy the following code to the editor and replace `<your-name>.thecatapi` with the 
actual device ID. 
```tt
class @<your-name>.thecatapi {
  // tell the system this device uses customized js code
  import loader from @org.thingpedia.v2(); 

  /* 
    The function to get random cat pictures.
    Example commands: "show me a cat", "get 3 cats".
    Qualifiers: 
      - list: the query returns multiple results  
  */
  list query get(in opt count: Number,
                 out image_id: Entity(com.thecatapi:image_id),
                 out picture_url: Entity(tt:picture),
                 out link: Entity(tt:url))
  // confirmation sentence which will be prompted to the users before execution:
  #_[confirmation="cat pictures"]
  #[doc="get `count` many cat pictures"];
}
```

## Step 3: providing some natural language examples
Click on `dataset.tt` on the left panel. 
Copy the following code to the editor and replace `<your-name>.thecatapi` with the 
actual device ID. 
```tt
dataset @<your-name>.thecatapi {
  // the "utterances" annotation specifies different ways to express the command
  query  := @<your-name>.thecatapi.get()
  #_[utterances=["a cat picture","a random cat picture","cats"]];

  /* 
    Example command can also have parameters.
    Each parameter used must specify the type, such that when connecting different 
    snippets together, the system knows what argument can be passed to the parameter.
  */
  query (p_count :Number)  := @<your-name>.thecatapi.get(count=p_count)
  #_[utterances=["${p_count:const} cat pictures"]];
}
```

## Step 4: submitting the device
Click the `SAVE` button at the top left corner to submit the device. 
Congratulation! You made yourself a cat device in Thingpedia. 
Go to [Thingpedia page](/thingpedia) and search for "my cat api" to see your device.

## Try your device
Please give Almond around 5 minutes to digest the device you just created.
A banner will tell you the status on the top of the page. 
Once the banner disappears,
you can go to [My Almond](/me) and type in `get a cat picture` to try out your device.

Note that at this point, the natural language support is very limited. 
You can only use the exact sentence you have put in `dataset.tt` (queries need a `get` in front as in `get a cat picture`). 
If you want to train the full model, click on the `Start training` button at the bottom 
of the details page of your device to start a new training job. The training will take up to 27 hours.   