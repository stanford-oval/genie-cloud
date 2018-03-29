# Device with Zero Line of Code
Amazon Alexa has over 15,000 skills. 
However, the majority of them are very simple and similar
To help hooking up these simple devices, we provide package types for some very typical devices which requires zero coding. 

## RSS Feed
TODO: an example of RSS Feed

## Preloaded
If a device simply provides an interface for HTTP requests, `Preloaded` package type will probably save you lots of time. 

In the following, let's go through an simple example: [Quotes](https://almond.stanford.edu/thingpedia/devices/by-id/com.forismatic.quotes).
_Quotes_ uses the API provided by [forismatic.com](https://forismatic.com/en/api/), which requires no authentication or developer key.
It returns a random quote in JSON format as follows:
```json
{
    "quoteText": "Always seek out the seed of triumph in every adversity.",
    "quoteAuthor": "Og Mandino",
    "senderName":"",
    "senderLink":"",
    "quoteLink":"http://forismatic.com/en/23e53ff443/"
}
``` 

To hook this service up with Almond, go to [device create page](https://almond.stanford.edu/thingpedia/upload/create) 
and pick `Preloaded` as the package type.
Add a query, pick a name you like. 
Then, click on `Properties` button of the query and tick the box for `API Endpoint URL`. 
The corresponding field will show up and simply fill in the URL of the API of your service, 
in this case: 
```json
http://api.forismatic.com/api/1.0/?method=getQuote&format=json&lang=en
```

Then we need to add the arguments we care about from the JSON output. 
In this _Quotes_ example, we want `quoteText` and `quoteAuthor`. 
Thus, we create two arguments, one named `text`, and the other named `author`, both in type `String`.
Then for each argument, tick the box `JSON Property Name` and fill the corresponding field name from the JSON.
So fill `quoteText` for argument `text` and `quoteAuthor` for `author`.

Fill in the rest empty boxes as usual and write some example commands for the device, and that's it! 
Pick an icon you like, and submit the device, you are good to go!