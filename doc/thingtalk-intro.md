# ThingTalk by examples

## What is ThingTalk?

ThingTalk is the programming language that Almond uses. It's a _declarative
domain-specific language_, which means it's a language that we specifically developed
for the Internet of Things (hence the name) and it does not use common constructs
like for, if or for statements, providing a higher level abstraction for connecting
things.

## What can I write in ThingTalk?

ThingTalk shares similar spirit with the well-known 
[IFTTT](https://ifttt.com/) service, but provides a more powerful and flexible way to express
more complicated tasks.

A ThingTalk program is composed of a list of _rules_. A rule combines a _stream_ with an action.
The stream determines both the data to operate on and the time at which the action is executed.

## The Basics

Let's start with the basics: like every programming language, we start from Hello World.
This tutorial assumes that you already have configured Almond. If not, see the [Getting Started Tutorial](/getting-started.md)
first.

This is the code for the Hello World app:

    now => @org.thingpedia.builtin.thingengine.builtin.say(message="Hello, world!");

To test this, you can go to [Web Almond](/me/conversation) and type `\t` followed by a space followed by the ThingTalk code.
The special `\t` prefix tells the system that your input is code and not a natural language sentence.

Here we can see we define our program with one rule with it.
The rule has two parts: the part before the `=>` is the stream, the part after is the action.

Here the trigger is just `now`, which invokes the action exactly once (when the program is started), with no data.
For the action, we choose `say` from the [Miscellaneous Interfaces](/thingpedia/devices/by-id/org.thingpedia.builtin.thingengine.builtin),
which just displays the message back. Parameters in ThingTalk are passed by keyword, using
the names indicated in the device specification.

## Operating on Data

The `now` stream contains no data and fires only once, so it is not particularly
interesting. To access more complex streams, we have three options:

 - combine `now` with a source of data: `now => <table>`
 - monitor a source of data (table)
 - monitor a source of data and then combine it with a second source

A source of data is specified in the form of a (virtual) _table_, representing a
remotely-accessible database. The simplest form of table invokes a single query,
chosen from a device specification:

    now => @com.twitter.my_tweets() => notify

In this case, we choose the `my_tweets` query from [Twitter](/thingpedia/devices/by-id/com.twitter),
pass no parameters, and combine it with the `now` stream. The result is a source
of data that contains the list of recent tweets from the user.

In this example, the program uses the `notify` action, which presents the data
to the user (in the form of speech, text, or a widget, depending on the form factor
of Almond). Alternatively, one can specify an action with side effects:

    now => @com.twitter.my_tweets() => @com.twitter.retweet(tweet_id=tweet_id)

The action is executed for each row returned by the stream or table.
In this case, we use the `tweet_id` output parameter from the source of data, and bind
it to the input parameter with the same name of `@com.twitter.retweet`. The result
is that all recent tweets by the user are retweeted.

## Continuous Execution

In addition to `now`, ThingTalk supports _monitor streams_, which continuously monitor
a table for changes in data, and execute the actions on new rows.
In code, this would look like:

    monitor @com.twitter.my_tweets() => notify;

This produces a notification to the user every time the user tweets.

Streams can also be combined with tables to form a _join stream_, which reads from
two sources of data at the same time:

    (monitor @com.twitter.my_tweets()) join @com.bing.web_search() on (query=text) => notify;
    
In this case, each new tweet from the user is combined with the `web_search` table
from [Bing](/thingpedia/devices/by-id/com.bing), using `query = text` as the join
condition. In practice, this rule means that every time the user tweets, Almond
will search the text of the tweet on Bing and show the result to the user.

The order of `monitor` and `join` can also be reversed:

    monitor (@com.twitter.my_tweets() join @com.bing.web_search() on (query=text)) => notify;

In that case, Almond will monitor the join of the two tables, that is, it will continuously
query Bing based on the user's tweets and notify if the search results change (that is,
if there is a new row that was not present previously).

## Filtering

What if the user does not want to return all tweets, but only those with a specific
hashtag? This can be accomplished using a filter:

    now => @com.twitter.my_tweets(), contains(hashtags, "almond"^^tt:hashtag) => notify;

The filter is specified with a comma following the table that it filters, followed
by a boolean predicate that uses the output parameters of that table. Multiple filters
can be combined with `&&` (and) and `||` (or).
For the full list of predicates supported by ThingTalk, see the [ThingTalk reference](/doc/thingtalk-reference.md).

In this example, we filter on the `hashtags` parameter, which is of type `Array(Entity(tt:hashtag))`,
so we use the `contains` predicate. The value, which must be of type `Entity(tt:hashtag)`,
is specified using the `^^` syntax to separate the actual value from its type.

Filters can be applied to both tables and streams, i.e. the following are equivalent:

    (monitor @com.twitter.my_tweets()), contains(hashtags, "almond"^^tt:hashtag) => notify;
    monitor (@com.twitter.my_tweets(), contains(hashtags, "almond"^^tt:hashtag)) => notify;

If parenthesis are omitted, the `monitor` keyword has precedence.

## Timers

In addition to operating on changes on data, rules can be fired at specific times using
timer streams, using the syntax:

    timer(base=makeDate(), interval=1h) => @org.thingpedia.builtin.thingengine.builtin.say(message="Hourly reminder!");

This syntax creates a timer that starts now (`makeDate()` with no parameter is the current
time) and fires every hour.

Timers, like monitor streams, can be combined with other data sources:

    timer(base=makeDate(), interval=1h) join @com.twitter.my_tweets() => notify;

For the precise syntax of timers, see the [ThingTalk reference](/doc/thingtalk-reference.md).

## Edge Stream

Monitor streams are a special case of _edge streams_: streams that are constructed from
another stream, and filter it based on immediate history. Two types of edge streams
exist: _edge on new_ streams, and _edge filter_ streams.

An edge on new stream filters the stream to contain only data that was not previously
present in the stream. This is very similar to a monitor stream, and in fact monitor
is syntactic sugar for edge stream with a particular timer. I.e.

    monitor @com.twitter.my_tweets() => notify

Is (semantically) equivalent to

    edge (timer(base=makeDate(), interval=...) join @com.twitter.my_tweets()) on new => notify

Where the interval is automatically chosen based on the polling interval specified in
Thingpedia.

Edge streams can be useful when combined with timers:

    edge (timer(base=makeDate(), interval=1h) join @com.twitter.my_tweets()) on new => notify;
    
This program will look at the user's tweets at most every hour (rather than instantly, which is
the default for `@com.twitter.my_tweets`), and furthermore will only notify on new tweets.

Moreover, edge filters allow to specify richer conditions than "the value differs".
With an edge filter (whose syntax is `edge `_stream_` on `_filter_), the rule is only evaluated
if the filter was previously false and is now true.

Consider the two examples:

    edge (monitor @thermostat.get_temperature()) on value >= 70F => notify;
    monitor @thermostat.get_temperature(), value >= 70F => notify;

In the first case, the user receives only one notification, as the thermostat crosses from below
70 Farhenheit to above. In the second case, once the temperature is above 70, any fluctuation
will result in a new notification, which is potentially unwanted. For this reason, it is more
common to use edge filters rather than regular filters with numeric values.

## Lambdas

So far, we only introduced full programs, composed of a stream (possibly `now`) or table and an action
(possibly `notify`). These programs are complete and not composable.

We can instead split each part of a program into a composable part using lambda syntax:

    let table my_tweets := \() -> @com.twitter.my_tweets();
    let table my_tweets_with_hashtag := \(hashtag : Entity(tt:hashtag)) -> @com.twitter.my_tweets(), contains(hashtags, hashtag);
    let stream when_i_tweet := \() -> monitor @com.twitter.my_tweets();

Lambdas are declared with `let`, followed by the type of the declaration (`table`, `stream` or `action`),
followed by a name, the list of parameters, and their body.

If the lambda has no parameters, the `\() ->` syntax can be omitted, so the following are equivalent:

    let table my_tweets := \() -> @com.twitter.my_tweets();
    let table my_tweets := @com.twitter.my_tweets();

Lambdas can be used in a program to make it more readable:

    {
    let stream when_i_tweet := \() -> monitor @com.twitter.my_tweets();
    when_i_tweet() => notify;
    }

Here we wrap the program in `{}` because it uses more than one statement.

Lambdas are also used to provide composable examples for Thingpedia Devices,
as detailed [in their guide](/doc/thingpedia-device-intro-example-commands.md).
