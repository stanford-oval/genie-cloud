# Device with Zero Line of Code
Thingpeidia provides a simple way to hook up some typical devices with zero coding.
Currently, we support `Generic Rest` APIs that use no authentication or just standard OAuth 2.0, and `RSS Feed`.

## Generic REST
If a device simply provides an interface for HTTP requests, `Generic REST` package type will probably save you lots of time. 

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

To hook this service up with Almond, go to [device creation page](https://almond.stanford.edu/thingpedia/upload/create) 
and pick `Generic REST` as the package type.
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

## RSS Feed
We also provide a simple interface to hook up RSS feed style services.
Pick `RSS Feed` as the package type and similar to `Generic REST`, put the RSS feed URL into the field
`API Endpoint URL`.
Five arguments are supported:
- `title` 
- `link` (the link to the original page, in type `URL`)
- `updated` (the updated time of the feed, in type `Date`)
- `description`
- `picture_url`

Note that some RSS feed may only contains `title` and `link`. 
Check the RSS feed format carefully and DO NOT use an argument if it is not in the feed of your service. 

Then as usual, fill in the rest, add example commands, and submit. No code needed! 
