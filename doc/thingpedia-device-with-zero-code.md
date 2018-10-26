# Declarative Devices in Thingpedia

Thingpedia provides a way to connect to devices that use common protocols with no additional JavaScript code.
Currently, we support RSS feeds (in Atom or RSS 1.0 format),
and Generic [REST](https://en.wikipedia.org/wiki/Representational_state_transfer) APIs that return JSON. 
Note that if a device needs OAuth or other customized computation on the return results, a Javascript 
code package is required. 

[[toc]]

## RSS Feed
We provide a simple interface to connect RSS feed services with Almond.
You can find an example in [Tutorial 1](/doc/thingpedia-tutorial-nyt.md).

Five parameters are supported:
- `title` 
- `link` (the link to the original page, in type `URL`)
- `updated` (the updated time of the feed, in type `Date`)
- `description`
- `picture_url`

Note that some RSS feed may only contains `title` and `link`. 
Check the RSS feed format carefully and DO NOT use an argument if it is not in the feed of your service. 

## Generic REST
If a device uses generic RESTful APIs and returns the data in JSON format, 
`loader` from `@org.thingpedia.generic_rest.v1` will help you connect the device easily. 

In the following, let's go through a simple example: [Quotes](/thingpedia/devices/by-id/com.forismatic.quotes).
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

To create a device for this service in Thingpedia, we define the device class as follows:
```tt
class @com.forismatic.quotes {
  // tell the system the device uses generic rest
  import loader from @org.thingpedia.generic_rest.v1();

  // the function to return a random quote
  query get(out text: String #[json_key="quoteText"],
            out author: String #[json_key="quoteAuthor"])
  #_[confirmation="a quote"]
  #_[formatted=[{type="text",text="${text} By ${author}."}]]
  #[doc="get a quote"]
  #[url="http://api.forismatic.com/api/1.0/?method=getQuote&format=json&lang=en"];
}
```
The device class contains one query function called "get", which returns a random quote.
We first need to tell the system where we get the data from. 
We use the annotation `url` to specify the URL of the API end point for this function,
as shown in the last line. 

Then we need to choose the parameters we care about from the JSON output. 
In this example, we want `quoteText` and `quoteAuthor`. 
Thus, we add two output parameters, `text` and `author`, both in type `String`.
Then for each of them, we use annotation `json_key` to specify the corresponding filed name
from the JSON. Thus we have 
```tt
out text: String #[json_key="quoteText"]
```
and 
```tt
out author: String #[json_key="quoteAuthor"]
```

If the parameter name is the same with the corresponding field name in JSON, the 
`json_key` annotation can be omitted. 

Then, put the code in `manifest.tt`, add some example commands in `dataset.tt`, and submit. 
No Javascript needed!


