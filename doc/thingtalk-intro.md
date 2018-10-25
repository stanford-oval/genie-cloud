# Introduction to ThingTalk

[[toc]]

## What is ThingTalk?

Almond is a _programmable virtual assistant_, that is, every command that the user issues is
translated into a programming language, called ThingTalk and then executed. ThingTalk is a _declarative
domain-specific language_ we specifically developed for the Internet of Things.
It provides a higher level abstraction for connecting
things, while hiding the details of configuration and networking.

## What can I write in ThingTalk?

ThingTalk provides a powerful and flexible way to express complicated tasks.

A ThingTalk program has a simple construct: `stream => query => action`
where each of `stream`, `query`, and `action` can b
Stream determines when the rest of the program. 


A ThingTalk program is composed of a list of _rules_, each terminated by a semicolon.
A rule combines a _stream_,  a _query_ (optional), and an _action_ in order.
The stream and query together determine the time at which the action 
is executed and the data to operate. 
These three components are connected with `=>` to form the rule.

Here is an example of ThingTalk program which gets a cat picture and shows it to the user:
```tt
now => @com.thecatapi.get() => notify;
```

In this example, the stream is just `now`, which invokes the action exactly once 
when the program started. The query invokes the `get` function from the device
[Cat API](https://almond.stanford.edu/thingpedia/devices/by-id/com.thecatapi)
which returns a cat picture. The action is set to `notify`, which will simply show the 
result to the user.
To test this, you can go to [Web Almond](/me/conversation) and type `\t` followed by a space followed by the ThingTalk code.
The special `\t` prefix tells the system that your input is code and not a natural language sentence.


## Stream — when does the action run?
In the previous example, you have seen one example of stream, `now`, which fires once at the moment
the rule is created. 
In addition to `now`, ThingTalk allows a rule to stay active in the background and trigger the action 
at a future time when a certain condition is met.  
The supported stream types include _monitor stream_ and _timer_.

### Monitor stream 
In Thingpedia, there are two types of functions: _query_ and _action_.
Most queries are _monitorable_, which means they can be turned into a stream,
called _monitor stream_.
A monitor stream will trigger the rest of the rule once the returned data from the query changes.

For example, one can set up a monitor for Fox News with the following command
```tt 
monitor @com.foxnews.get() => notify;
```
This rule starts a monitor on `get` query function 
from [Fox news](https://almond.stanford.edu/thingpedia/devices/by-id/com.foxnews)
produces a notification to the user every time Fox News publishes something new.
Note that in this example, there is no query part. When the monitor gets triggered,
it also passes the information directly to the action `notify`.

### Timer
In addition to operating on changes on data, rules can be fired at specific times using
timer streams, using the syntax:
```tt
timer(base=makeDate(), interval=1h) => @com.thecatapi.get() => notify;
```

This syntax creates a timer that starts now (`makeDate()` with no parameter is the current
time) and fires every hour.

A second form of timer triggers every day at a specific time:
```tt
attimer(time=makeTime(8, 0)) => @com.thecatapi.get() => notify;
```

This syntax creates a timer that triggers every day at 8 AM. 

For the precise syntax of timers, see the [ThingTalk reference](/doc/thingtalk-reference.md).

## Query — what data does the action need?
In our first example, we have seen a query `@com.thecatapi.get()`.
It talks to the Cat API and gets a random cat picture from it.

The query in a rule provides data for the action to consume.
Note that if the rule also contains a monitor stream,
both the data from the stream and query will be available to use in the action.

## Action — what does the program do at the end?
After a rule is triggered and the data is retrieved, the program will run an action.
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
Parameters in ThingTalk are passed by keyword, using the names indicated in the device specification.
```tt
now => @com.thecatapi.get(count=3) => notify;
```
The `get` function for `@com.thecatapi` has an optional input parameter `count`. 
In this example, we set `count=3` so we can get 3 cat pictures (Who doesn't like more cats?)

### Parameter passing
In addition to constant values, we can also pass the value returned by previous functions, by specifying the name
of one _output parameter_ of the previous function. 
```tt
monitor @com.foxnews.get() => @com.slack.send(channel="general", message=title);
```

### Filtering on output parameters
What if the user does not want to be notified of all news articles, but only of those related to a specific topic?
This can be accomplished using a filter:
```tt
monitor (@com.foxnews.get(), title =~ "Stanford") => notify;
```
The filter is specified with a comma following the table that it filters, followed
by a boolean predicate that uses the output parameters of that table. 
In this example, we filter on the `title` parameter; the rule will be triggered only if
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
In practice, this rule means that get the title of news from Fox News, translate it 
to Chinese, and show translated title to the user. 

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
Instead of monitoring changes of the search results, this only monitors the changes 
on Fox News, and then runs the Bing search once it detects a new article.

### Edge monitor
In addition to `now`, timer, and monitor stream, ThingTalk also supports _edge_monitor_. 
Two types of edge streams exist: _edge on new_ streams, and _edge filter_ streams.

An edge-on-new stream filters the stream to contain only data that was not previously
present in the stream. This is very similar to a monitor stream.
It can be useful when combined with timers to have customized 
polling interval different from the default: 
```tt
edge (timer(base=makeDate(), interval=1min) join @com.foxnews.get()) on new => notify;
```

This program will look at the Fox News at most every minute (rather than 1 hour, which is
the default interval for `@com.foxnews.get`), and furthermore will only notify on new news.

Moreover, edge filters allow specifying richer conditions than "the value differs".
With an edge filter (whose syntax is `edge` _stream_ `on` _filter_), the rule is only evaluated
if the filter was previously false and is now true.

Consider the two examples:
```tt
edge (monitor @thermostat.get_temperature()) on value >= 70F => notify;
monitor @thermostat.get_temperature(), value >= 70F => notify;
```

In the first case, the user receives only one notification, as the thermostat crosses from below
70 Fahrenheit to above. In the second case, once the temperature is above 70, any fluctuation
will result in a new notification, which is potentially unwanted. For this reason, it is more
common to use edge filters rather than regular filters with numeric values.
