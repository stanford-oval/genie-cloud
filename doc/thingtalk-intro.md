# Introduction to ThingTalk

[[toc]]

## What is ThingTalk?

Almond is a _programmable virtual assistant_, that is, every command that the user issues is
translated into a programming language, called ThingTalk and then executed. ThingTalk is a _declarative
domain-specific language_ we specifically developed for the Internet of Things.
It provides a higher level abstraction for connecting
things, while hiding the details of configuration and networking.

## What can I write in ThingTalk?

A ThingTalk program has a simple construct: `stream => query => action;`:
it combines a _stream_,  a _query_ (optional), and an _action_ in order, and terminates by a semicolon. 
The stream determines when the rest of the program runs, 
the query retrieves data, and the action shows the data to the user 
or invokes an action function defined in Thingpedia. 

Here is an example of ThingTalk program which gets a cat picture and shows it to the user:
```tt
now => @com.thecatapi.get() => notify;
```

In this example, the stream is just `now`, which means the program will run once immediately. 
The query invokes the `get` function from [The Cat API](https://almond.stanford.edu/thingpedia/devices/by-id/com.thecatapi)
which returns a random cat picture. 
The action is `notify`, which will show the cat picture to the user.

You can issue commands in ThingTalk directly in [My Almond](/me).
To tell the system that your input is code and not a natural language sentence,
type `\t` with a space before the ThingTalk code.

For example, try entering `\t now => @com.thecatapi.get() => notify;` directly into [My Almond](/me)!


## Stream — when does the rest of program run?
In the previous example, you have seen one example of stream, `now`, which fires once immediately. 
In addition to `now`, ThingTalk allows a program to stay active in the background and trigger the rest of the program 
at a future time when a certain condition is met.  
The supported stream types include _monitor stream_ and _timer_.

### Monitor stream 
_Query_ functions in Thingpedia can be monitored and turned into a stream, called _monitor stream_.
A monitor stream will trigger the rest of the program once the returned data from the query changes.

For example, one can set up a monitor for Fox News with the following command
```tt 
monitor @com.foxnews.get() => notify;
```
This program starts a monitor on `get` query function 
from [Fox news](https://almond.stanford.edu/thingpedia/devices/by-id/com.foxnews)
produces a notification to the user every time Fox News publishes something new.
Note that in this example, there is no query part. When the monitor gets triggered,
it also passes the information directly to the action `notify`.

### Timer
In addition to operating on changes of data, programs can be fired at specific times using
_timer_ streams, using the syntax:
```tt
timer(base=makeDate(), interval=1h) => @com.thecatapi.get() => notify;
```

This syntax creates a timer that starts now (`makeDate()` with no parameter is the current
time) and fires every hour.

Another form of timer triggers every day at a specific time:
```tt
attimer(time=makeTime(8, 0)) => @com.thecatapi.get() => notify;
```

This syntax creates a timer that triggers every day at 8 AM. 

For the precise syntax of timers, see the [ThingTalk reference](/doc/thingtalk-reference.md).

## Query — what data does the action need?
In our first example, we have seen a query `@com.thecatapi.get()`.
It talks to the Cat API and gets a random cat picture from it.

The query in a program provides data for the action to consume.
Note that if the program also contains a monitor stream,
both the data from the stream and query will be available to use in the action.

## Action — what does the program do at the end?
After a program is triggered and the data is retrieved, the program will run an action.
`notify` is the default action which shows the data from the stream and the query to the user.
Besides `notify`, the action part can also invoke any action function in Thingpedia. 
For example, instead of being notified inside Almond, you can choose to send the information
to Slack as follows:
```tt
monitor @com.foxnews.get() => @com.slack.send();
```

## Handling Parameters
So far, we have not used any parameters for functions in our examples.
In the following we will introduce how to handle parameters in ThingTalk. 

### Specifying input parameters
Parameters in ThingTalk are passed by keyword, using the names of the parameters defined in Thingpedia.
```tt
now => @com.thecatapi.get(count=3) => notify;
```
The `get` function for `@com.thecatapi` has an optional input parameter `count`. 
In this example, we set `count=3` so we can get 3 cat pictures. (Who doesn't like more cats?)

### Parameter passing
In addition to constant values, we can also pass the value returned by previous functions, by specifying the name
of one _output parameter_ of the previous function. 
```tt
monitor @com.foxnews.get() => @com.slack.send(channel="general", message=title);
```
In this example, the message sent to slack is the value of the output parameter `title` from Fox News. 

### Filtering on output parameters
What if the user does not want to be notified of all news articles, but only of those related to a specific topic?
This can be accomplished using a filter:
```tt
monitor (@com.foxnews.get(), title =~ "Stanford") => notify;
```
The filter is specified with a comma following the corresponding stream or query, followed
by a boolean predicate that uses the output parameters. 
In this example, we filter on the `title` parameter; the program will be triggered only if
the title of the article contains (denoted by `=~`) the word "Stanford".

Multiple filters can be combined with `&&` (and) and `||` (or):
```tt
monitor @com.foxnews.get(), title =~ "Stanford" || title =~ "Almond" => notify;
```

For the full list of predicates supported by ThingTalk, see the [ThingTalk reference](/doc/thingtalk-reference.md).

## Code Snippet
So far, we only introduced full programs, composed of a stream (possibly `now`), a query, and an action
(possibly `notify`). These programs are complete and not composable.

We can instead split each part of a program into a composable part using the following declaration syntax:
```tt
query (count : Number) := @com.thecatapi.get(count=count);
stream (keyword : String) := monitor @com.foxnews.get(), title =~ keyword;
```

Code snippets are used to provide composable examples for devices in Thingpedia,
as detailed [in their guide](/doc/thingpedia-tutorial-dataset.md).
 
## Advanced Topics 
### Joins
A query can be combined with another query to form a _join_, which reads from
two sources of data at the same time:
```tt
now => @com.foxnews.get() join @com.yandex.translate.translate(target_language="ch") on (text=title) => notify;
```
In this case, each news from Fox News is combined with the `translate` query from
[Yandex Translate](https://almond.stanford.edu/thingpedia/devices/by-id/com.yandex.translate),
using `text=title` as the join condition.
In practice, this program means that get the title of news from Fox News, translate it 
to Chinese, and show the translated title to the user. 

A monitor stream can also work with a joined query:
```tt
monitor (@com.foxnews.get() join @com.bing.web_search() on (query=title)) => notify;
```
In that case, Almond will monitor the join of the two queries, that is, it will continuously
query Bing based on the news title and notify if the search results change.

Note that the semantics of this command is different from the following one:
```tt
monitor @com.foxnews.get() => @com.bing.web_search(query=title) => notify;
```
Instead of monitoring changes of the search results, this program only monitors the changes 
on Fox News, and then runs the Bing search if it detects a new article.

### Edge monitor
In addition to `now`, timer, and monitor stream, ThingTalk also supports _edge_monitor_. 
Two types of edge streams exist: _edge on new_ streams, and _edge filter_ streams.

An _edge on new_ stream filters the stream to contain only data that was not previously
present in the stream. This is very similar to a monitor stream.
It can be useful when combined with timers to have customized 
polling interval: 
```tt
edge (timer(base=makeDate(), interval=1min) join @com.foxnews.get()) on new => notify;
```

This program will look at the Fox News every minute (rather than 1 hour, which is
the default interval for `@com.foxnews.get`), and notify users on new news.

An _edge filter_ allows users specifying richer conditions than "the value differs".
When it's used, the program is only evaluated if the filter was previously false and is now true.

Consider the two examples:
```tt
edge (monitor @thermostat.get_temperature()) on value >= 70F => notify;
monitor @thermostat.get_temperature(), value >= 70F => notify;
```

In the first case, an edge filter is used: 
the user receives only one notification, as the thermostat crosses from below
70 Fahrenheit to above. In the second case, once the temperature is above 70, any fluctuation
will result in a new notification, which is potentially unwanted. For this reason, it is more
common to use edge filters rather than regular filters with numeric values.
