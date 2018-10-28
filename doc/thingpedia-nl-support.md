# Natural Language Support for Devices in Thingpedia

[[toc]]

Almond runs command in ThingTalk, but it speaks English. 
In the following, we will introduce how to get the best natural language support from us
so that Almond understands users' commands related to your device
and present the results to the users properly. 

## Natural language understanding
When creating a new device, a dataset files containing the example commands is required. 
These example commands provide the training data for your device. 
The natural language understanding ability of Almond heavily relies on the quality 
and quantity of the examples. 

### Code snippet vs full program
We strongly suggest to use _code snippet_ instead of _full program_ in the example commands.
A full program contains a stream, a query (optional), and an action. It can be executed directly by Almond.
For example, the full program to get a cat picture will look like:
```tt
now => @com.thecatapi.get() => notify;
```
On the other hand, code snippet is a partial program - it defines either a stream, a query, or an action.
As shown in the previous example, the code snippet of the query to get a cat picture looks like:
```tt
query := @com.thecatapi.get();
```
A code snippet cannot be executed by Almond right away, but it can be composed with other 
code snippet and builtin functions (e.g., `now`, `notify`, `timer`) to form a full program. 

Once Almond receives the code snippets, it will compose it with other code snippets randomly. 
For example, if we have the following two code snippets:
```tt
query := @com.thecatapi.get();
action := @com.slack.send();
```
We can generate a list of full programs including:
```tt
now => @com.thecatapi.get() => notify;
now => @com.slack.send();
now => @com.thecatapi.get() => @com.slack.send();
attimer(time=...) => @com.thecatapi.get() => notify;
attimer(time=...) => @com.slack.send();
attimer(time=...) => @com.thecatapi.get() => @com.slack.send();
```

Thus, by providing the composable code snippets, Almond will be able to generate a large 
number of full programs for training and thus get a better accuracy. 

### Utterances
Each command needs a list of utterances. The syntax is as follows:
```tt
query (p_count :Number)  := @com.thecatapi.get(count=p_count)
#_[utterances=["$p_count cat pictures", "$p_count cats"]];
```
An `utterances` annotation is used to provide different ways of expressing the commands.
It takes a list of strings where parameters can be referred by `$param` or `${param}`
(the latter is only needed if the parameter is immediately followed by 
a letter number or underscore).

The utterances will be used to generate the _synthetic sentence_ of the 
full program composed by the code snippet. 
For example, if we have the following two code snippets with the corresponding utterances:
```tt
query := @com.thecatapi.get() #_[utterances=["a cat picture"];
action := @com.slack.send() #_[utterances=["send a message to slack"];
```
Then when we compose the full program `now => @com.thecatapi.get() => @com.slack.send();`,
we will generate the synthetic sentences such as:
“get/search/show me/find **_a cat picture_**, then **_send a message to slack_**”.

By default, the utterances for a query should be __noun phrases__. 
When we compose the sentence, we will add generic verbs before the noun phrase such as `get`, `show`.
As in our example, we have utterance “a cat picture” instead of “get a cat picture”.
This is particularly useful for parameter passing. 
For example, in the following program, the cat picture is sent to Slack:
```tt
now => @com.thecatapi.get() => @com.slack.send_picture(picture_url=picture_url);
``` 
Let's say an utterance of `@com.slack.send_picture` is `send $picture_url to Slack`.
When we compose the sentence,
we will replace the parameter with the utterance of `@com.thecatapi.get`, and generate:
“send **_a cat picture_** to Slack”.

If you want to use a non-generic verb for your query, put a comma `,` before your utterance.
For example, a command to get the translation of some text 
might want to use the command-specific verb `translate`, 
thus we can write the utterance as “, translate the text”.

For streams, write the utterances as a _when phrase_, such as “when it's raining”, “when I receive an email”.
For actions, write the utterances as a verb phrase in the imperative form, such as “send a message”.

### Other tips and tricks
#### `canonical` annotation 
Unlike most of the other programming languages, the choice of parameter names and function names is 
important in ThingTalk: it affects the performance of the natural language translation. 

For example, function `@com.thecatapi.get` has an output parameter `image_id`, then 
we will generate sentences like “get a cat picture, then send the __image id__ to Slack” when composing 
the following program.
```tt
now => @com.thecatapi.get() => @com.slack.send(message=image_id);
```

To make the synthetic sentences more natural, you can use `canonical` annotations
when declaring your function in device manifest. 
The annotation specifies how the parameter will be expressed in natural language.  
For example, we can define the `@com.thecatapi.get` like this:
```tt
list query get(in opt count: Number,
               out image_id: Entity(com.thecatapi:image_id) #_[canonical="id of the picture"],
               out picture_url: Entity(tt:picture),
               out link: Entity(tt:url))
```

Then, for the same program, we will generate 
“get a cat picture, then send the __id of the picture__ to Slack”.

#### Parameter naming conventions
To achieve the best accuracy, we suggest to use the same parameter names 
as other similar devices. Here are some naming conventions to follow:
- if your function returns a picture as the main result, name the argument `picture_url`
- if your function accepts a picture as input, name the argument `picture_url`
- if your function accepts any URL, name the argument `url`; if it accepts any URL of videos, name it `video_url`
- if your function returns an article or link, name the title `title`, the blurb or description `description`,
  the URL `link`, the update date `updated` and the author name `author`
- if your function accepts a query string to search, name it `query`
- if your function allows you to upload a picture with a short description, name the description `caption` and
  the picture `picture_url`
- if your function takes a free-form string to be posted on social media, name it `status`
- if your function takes two free-form strings to be posted on social media, name them `title` and `body`
- if your function turns on or off your device, name the function `set_power`, name the argument `power` and make it of type `Enum(on,off)`
- if your function takes a numeric range as input, name the lower bound `low` and the upper bound `high`
- if your function returns multiple results, and you can control the number of results returned, use a `count` parameter of type `Number`
   

## Response in natural language
Once Almond understands the issued command, Almond will execute it
and then potentially ask for additional information and present the results.

### Slot filling question for missing parameters
If a command misses a required input parameter, Almond will ask the user for the value.
A _slot filling_ question will be asked. 
By default, the question is “What's the value of <parameter-name>?”.
User might now understand such a question, especially when the parameter name is not informative enough.

To give user a better experience, you can provide customized slot filling question 
with a `prompt` annotation for each input parameter in your function.
For example, we have a function to post on LinkedIn in [Tutorial 3](/doc/thingpedia-tutorial-linkedin.md).
It has one input parameter named `status`. 
We can add `prompt` annotation to it as follows:
```tt
action share(in req status: String #_[prompt="What do you want to post?"])
#_[confirmation="share $status on your LinkedIn"]
#[doc="share a comment and a link "];
```

By default, the slot filling question will be “What's the value of status?”.
Now with the prompt provided, Almond will ask “What do you want to post” instead. 

### Confirmation 
Before a program is executed, Almond will confirm with the user 
to make sure it understand the command correctly. 
The confirmation sentence comes from the `confirmation` annotation for the function.
Similar to the `utterances` annotation for example commands, 
use noun phrases for queries and verb phrases in the imperative form for actions. 
Examples can be found in all the tutorials. 

Note that the confirmation sentence should include all the __required__ input parameter
with `$param` or `${param}`.

### Output format
When a stream or a query is combined with the action `notify`, 
the returned results will be presented to the user in Almond. 
By default, Almond will simply list the value of all the output parameters one by one 
in the order they are declared in the function signature.

You can customize the format of the output with the `formatted` annotation.
(Examples can be found in [Tutorial 1](/doc/thingpedia-tutorial-nyt.md)
and [Tutorial 3](/doc/thingpedia-tutorial-linkedin.md).)
The annotation takes a list of Objects. 
Each Object denotes one response. Four types of response is supported:
`text`, `picture`, `rdl`, and `code`.

#### Text response 
Text response returns a simple text message.
It has only one property: `text`. 
E.g., `{ type="text",text="Works in ${industry}" }` (in [Tutorial 3](/doc/thingpedia-tutorial-linkedin.md)).

####  Picture response: 
Picture response shows a picture to the user. 
It has only one property: `url`.
E.g., `{ type: "picture", url: "${picture_url}" }` (in [Tutorial 3](/doc/thingpedia-tutorial-linkedin.md)).

#### RDL response: 
RDL response returns a clickable with title and description, suitable for website 
links and news articles.
It has three properties: `webCallback` (the link), `displayTitle` (the title), 
and `displayText` (the description, optional). 
See [Tutorial 1](/doc/thingpedia-tutorial-nyt.md) for an example of this format type.

#### Customized response
If you need more control over the output, such as different output based 
on results, you can choose `code` type and write Javascript code in the `code` property. 
The code contains a [self-executing anonymous function](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)
in String format.
The function will be invoked with three arguments: 
the result of your function (an object with each parameter as a property), 
a hint informing you of how the result will be shown to the user, 
and a `Formatter` object which provides . 
The function can return a string, a formatted message object 
(with the same structure as the JSON described here) 
or an array of objects.

The `Formatter` provides the following methods for your convenience:
- `measureToString(value, precision, unit)`: convert a value of `Measure` type to a string.
- `dataToString(date)`: convert a value of `Date` type to a string containing only the date.
- `timeToString(date)`: convert a value of `Date` type to a string containing only the time.
- `dateAndTimeToString(date)`: convert a value of `Date` type to a string containing both the date and the time.
- `locationToString(date)`: convert a value of `Location` type to a string
- `anyToString(object)`: convert any other value to a string (unnecessary for `String` type)

Here is an example used in [iCalendar](https://almond.stanford.edu/thingpedia/devices/by-id/org.thingpedia.icalendar).
We want to offer different responses based on if the return value contains `end_date` or not.
The code looks like this:
```javascript
(function({start_date, end_date}, hint, formatter) {
    if (end_date)
        return `The event runs from ${formatter.dateAndTimeToString(start_date)} to ${formatter.dateAndTimeToString(end_date)}`;
    else
        return `The event starts at ${formatter.dateAndTimeToString(start_date)}`;
})
```
And the annotation will look like this: 
```tt
#_[formatted=[{type="code",code="(function({start_date, end_date}, hint, formatter) {\nif (end_date)\nreturn `The event runs from ${formatter.dateAndTimeToString(start_date)} to ${formatter.dateAndTimeToString(end_date)}`;\nelse\nreturn `The event starts at ${formatter.dateAndTimeToString(start_date)}`;\n}"}]]
```