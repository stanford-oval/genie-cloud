# Tutorial 1: NY Times RSS Feed 

In this tutorial, you will create a NY Times device in Thingpedia.
You can request a developer account from [here](/user/request-developer) if you don't have one yet. 

## Step 1: setting up your device
Go to the [Device Creation Page](/thingpedia/upload/create), fill in the following basic information 
about the device:
- ID: `<your-name>.nytimes` (Each device in Thingpedia needs an unique ID, so use your name or email address 
in the device name to make sure it won't conflict with others)
- Name: `My New York Times`
- Description: `My New York Times RSS Feed`
- Category: `Media`
- Icon: choose a PNG file you like (512x512 resolution is recommended)
- JS code: leave it empty

## Step 2: describing what your device does
Click on `manifest.tt` on the left panel. Copy the following code to the editor.
```tt
class @com.nytimes
#_[name="New York Times"]
#_[description="New York Times RSS feed"] {
  import loader from @org.thingpedia.rss();
  import config from @org.thingpedia.config.none();

  monitorable list query get_front_page(out title: String,
                                        out link: Entity(tt:url),
                                        out updated: Date,
                                        out description: String)
  #_[canonical="get new york times front page"]
  #_[confirmation="New York Times articles"]
  #_[formatted=[{type="rdl",webCallback="${link}",displayTitle="${title}",displayText="${description}"}]]
  #[poll_interval=60min]
  #[doc="read the front page of the New York Times"]
  #[url="http://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"];
}
```

## Step 3: providing some natural language examples
Click on `dataset.tt` on the left panel. Copy the following code to the editor
```tt
dataset @com.nytimes language "en" {
    query  := @com.nytimes.get_front_page()
    #_[utterances=["new york times","the front page of the new york times","articles in the new york times"]];

    query  := (@com.nytimes.get_front_page()), updated >= start_of(day)
    #_[utterances=["today 's articles in the new york times"]];

    stream  := monitor (@com.nytimes.get_front_page())
    #_[utterances=["when the new york times publishes a new article"]];

    query  := (@com.nytimes.get_front_page()), updated >= start_of(week)
    #_[utterances=["new york times articles published this week"]];
}
```

## Step 4: submitting the device
Click the `SAVE` button at the top left corner to submit the device. 
Congratulation! You made your first device for Thingpedia. 
Go to [Thingpedia page](/thingpedia) and search for "New York Times" to see your device.

## Try your device
Go to [My Almond](/me). Type in `get new york times`. 