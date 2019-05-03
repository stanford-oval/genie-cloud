# Natural Language Support for Devices in Thingpedia

[[toc]]

Almond runs command in ThingTalk, but it speaks English. 
In the following, we will introduce how to get the best natural language support from us
so that Almond understands users' commands related to your device
and presents the results to the users properly. 

## Natural language understanding
When creating a new device, a dataset file containing the example commands is required. 
These example commands provide the training data for your device. 
The natural language understanding ability of Almond heavily relies on the quality 
and quantity of the example commands. 

### Primitive templates vs full programs
We strongly suggest to use _primitive templates_ instead of _full programs_ when writing example commands.
A full program contains a stream, a query (optional), and an action. It can be executed directly by Almond.
For example, the full program to get a cat picture will look like:
```tt
now => @com.thecatapi.get() => notify;
```
On the other hand, a primitive template is a partial program - it defines either a stream, a query, or an action.
The primitive template of a query to get a cat picture looks like:
```tt
query := @com.thecatapi.get();
```
Primitive templates can also have parameters, which will be replaced with concrete values 
in the generated program.
For example, given the following templates:
```tt
action (p_channel : Entity(tt:hashtag)) := @com.slack.send(channel=p_channel);
```
we automatically generate the programs:
```tt
now => @com.slack.send(channel="general"^^tt:hashtag);
now => @com.slack.send(channel="random"^^tt:hashtag);
...
```
By convention, parameters in primitive templates begin with `p_`, to distinguish them from function parameters.

The parameters of a primitive template can be used anywhere in the body, not just as input parameters. 
For example, they can be used as filters:
```
query (p_url : Entity(tt:url)) => @com.thecatapi.get(), starts_with(url, p_url);
```

A primitive templates cannot be executed by Almond right away, but it can be composed with other 
primitive templates and builtin functions (e.g., `now`, `notify`, `timer`) to form a full program. 
For example, if we have the following two primitive templates:
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

Thus, given the composable primitive templates, Almond will be able to generate a large 
number of full programs for training and thus get a better accuracy.

### Utterances 
An `utterances` annotation is used to provide different ways of expressing a command.
It takes a list of strings. In each utterance, concrete 
values for parameters are replaced by _placeholders_, which can be expressed by `$param` or `${param}`, 
where _param_ is the name of a declared parameter of the code snippet.
The braces are needed if the parameter is immediately followed by 
a letter, a number, or an underscore.

You also need the braces if you want to pass an option. Available options are 
`const` (with the syntax `${param:const}`) and `no-undefined`. `const` means that the placeholder must 
not be a parameter passed from a previous function; `no-undefined` means that a placeholder cannot
be replaced with a generic word such as “something” or “a certain value”. 
The syntax is as follows:
```tt
query (p_count :Number)  := @com.thecatapi.get(count=p_count)
#_[utterances=["${p_count:const} cat pictures", "$p_count cats"]];
```

The utterances will be used to generate the _synthetic sentences_ for the 
full programs composed by the primitive templates. 
For example, if we have the following two primitive templates with the corresponding utterances:
```tt
query := @com.thecatapi.get() #_[utterances=["a cat picture"];
action := @com.slack.send() #_[utterances=["send a message to Slack"];
```
Then when we compose the full program `now => @com.thecatapi.get() => @com.slack.send();`,
we will generate the synthetic sentences such as:
“get/search/show me/find **_a cat picture_**, then **_send a message to slack_**”.

Placeholders in the primitive templates will be replaced with:
- a concrete constant value;
- a generic word such as “something” or “someone”;
- a generic expression formed with “some” followed by the parameter name;
- a _coreference_ to a result produced previous by the previous function, in the from of “it” or “the” followed by a noun.

For example, given the following primitive templates:
```tt
query := @com.thecatapi.get() #_[utterances=["a cat picture"];
action (p_picture_url : Entity(tt:picture)) := @com.slack.send_picture(picture_url=p_picture_url) #_[utterances=["send ${p_picture_url} to Slack"];
```
The following sentences are generated:
- send **“...”** to Slack
- send **something** to Slack
- send **some picture** to Slack
- get a cat picture, then send **it** to Slack
- get a cat picture, then send **the picture** to Slack

**Hint**: To decide whether or not to use `const`, try replacing with the placeholder with “the” followed
by a noun, for example “the message” or “the picture”. If the sentence does not flow grammatically, or
it sounds awkward, then it is appropriate to use `const`. If you do so, you should also think of a different
utterance that allows such parameter passing. For example, this is the correct way to annotate
a primitive template that selects the channel for Slack:

```tt
action (p_channel : Entity(tt:hashtag)) := @com.slack.send(channel=p_channel)
#_[utterances=["send a message to channel ${p_channel:const}", "send a message to ${p_channel}"]
```



**Hint**: To decide whether or not to use `no-undefined`, replace the placeholder with the word “something”
(or “someone”, “somewhere”, etc.), and compare it against “anything” or “a certain thing”. If the use of
“something” is likely to mean “anything”, then you should `no-undefined`. For example, this is how you annotate filters for Slack:

```tt
stream (p_sender :Entity(tt:username))  := monitor ((@com.slack.channel_history()), sender == p_sender)
#_[utterances=["when ${p_sender:no-undefined} messages me on slack"]]
```

The motivation is that sentences of the form “when someone messages me on Slack” should be interpreted
the same as “when anyone messages me on Slack”, and not “when a certain person messages me on Slack”.

**Hint**: `no-undefined` does not make sense for required parameters, because the user always
specify a specific value before the program is executed.

The rules through which Almond generates full programs from primitives template are defined in
[Genie](https://github.com/stanford-oval/genie-toolkit/blob/master/languages/en/thingtalk.genie).

By default, the utterances for a query should be _noun phrases_.
When we compose the sentence, we will add generic verbs before the noun phrase such as `get`, `show`, `search`.
As in our example, we have the utterance “a cat picture” instead of “get a cat picture”.

Using noun phrases is necessary for parameter passing. Going back to the previous example
of cats and Slack:
```tt
query := @com.thecatapi.get() #_[utterances=["a cat picture"];
action (p_picture_url : Entity(tt:picture)) := @com.slack.send_picture(picture_url=p_picture_url) #_[utterances=["send ${p_picture_url} to Slack"];
```
in addition to the sentence “get a cat picture, then send **the picture** to Slack”, which is long
and verbose, we can also generate ”send **a cat picture** to Slack”. In this case, the placeholder
is replaced with the entire noun phrase of the function that generates the result to send.

For streams, write the utterances as _when phrases_, such as “when it's raining”, “when I receive an email”.
For actions, write the utterances as _verb phrases_ in the imperative form, such as “send a message”.

Additionally, if you want to use a non-generic verb for your query, put a comma `,` before your utterance.
The comma is a marker for a verb-phrase, and is automatically removed when generating sentences.
For example, the following are the primitive templates for translation:

```tt
query (p_text :String)  := @com.yandex.translate.translate(text=p_text)
    #_[utterances=["the translation of $p_text", ", translate $p_text"]]
```
These templates (combined a Slack template) result in the following sentences:
- show me the translation of “...”
- search the translation of “...”
- translate “...”
- translate “...” and then send it to Slack
- get the translation of “...” and then send it to Slack
- send the translation of “...” to Slack

**Note**: the first utterance of each distinct example will be presented in [Thingpedia Cheatsheet](/thingpedia/cheatsheet).
So put the most common and natural utterance first in the list.

**Note**: internally, the examples are not stored as `.tt` files, so any comment or formatting in the dataset file
will be lost, and multiple examples with the same code will be collapsed.

**Note**: the dataset you provide as part of your device submission must use American English. Translations can
be provided separately, and the `language` field of the dataset file is ignored. 

### Example values for parameters
To help Almond do a better job on handling commands with parameters, 
you can specify the example values for each of your parameter (of type String or Entity)
when declaring the function. 
The syntax is `#[string_values=<dataset-name>]`.

For example, the `send` function for Slack can be declared as follows:
```tt
action send(in req channel: Entity(tt:hashtag),
            in req message: String #[string_values="tt:message"])
```
In this case, we tell the system 
to use the values in the dataset `tt:message` as example values for parameter `message`.
Then Almond will replace `message` with the values in `tt:message` randomly when
generating the synthetic sentences. 

You can choose any of the existing datasets from the [Available String Datasets](/thingpedia/strings) page,
or submit your own, taylored to your device.
  
Note that example values are useful for both input and output parameters since
an output parameter can also be used in the command as a filter.


### Other tips and tricks
Unlike most of the other programming languages, the choice of parameter names is 
important in ThingTalk: it affects the performance of the natural language translation. 

For example, when composing the following program:
```tt
now => @com.nyt.get_front_page() => @com.slack.send(message=title);
```
we will generate the synthetic sentence : 
“get the front page of the new york times, then send the __title__ to Slack”.

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
   

## Natural language responses
Once Almond understands the issued command, Almond will ask for additional information 
if needed, execute the command, and present the results.

### Slot filling question for missing parameters
If a command misses a required input parameter, Almond will ask the user for the value,
by asking a _slot filling_ question. 
By default, the question is “What's the value of <parameter-name>?”.
Users might not understand such a question, especially when the parameter name is not informative enough.

To give users a better experience, you can provide a customized slot filling question 
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
Now with the prompt provided, Almond will ask “What do you want to post?” instead. 

### Confirmation 
Before a program is executed, Almond will confirm with the user 
to make sure it understands the command correctly when needed. 
The confirmation sentence comes from the `confirmation` annotation of the function.
Similar to the `utterances` annotation for example commands, 
use noun phrases for queries and verb phrases in the imperative form for actions. 
Examples can be found in all the tutorials. 

Note that the confirmation sentence should include all the __required__ input parameter
with `$param` or `${param}`, and the `const` option is not valid for the confirmation sentence.

### Output format
When a stream or a query is combined with the action `notify`, 
the returned results will be presented to the user in Almond. 
By default, Almond will simply list the value of all the output parameters one by one 
in the order they are declared in the function signature.

You can customize the output format with the `formatted` annotation.
The annotation takes a list of messages, using object syntax. 
Each Object represents one response and each response will be presented to users in the same order in the list. 
Four types of responses are supported: `text`, `picture`, `rdl`, and `code`.

#### Text response 
A text response returns a simple text message.
It has only one property: `text`. 
E.g., `{ type="text",text="Works in ${industry}" }` (in [Tutorial 3](/doc/thingpedia-tutorial-linkedin.md)).

As a shorthand, you can specify a text message with a bare string. 
That is, the following are equivalent:
```
#_[formatted=["Works in ${industry}"]]
#_[formatted=[{ type="text",text="Works in ${industry}" }]
```

Inputs and output parameters of the function can be referred to using the placeholder syntax. 
The following options can be specified, using the syntax `${param:opt}`:
- `time` (for type `Date`): display only the time portion of the date
- `date` (for type `Date`): display only the date (day, month, year) portion of the date
- `iso-date` (for type `Date`): display the date in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format
- `%` (for type `Number`): multiply the number by 100 before displaying
- a measurement unit (for type `Measure`): convert the value to the given unit before displaying; 
e.g. `${temperature:F}` displays the temperature in Farhenheit; note that the unit is **not** appended

####  Picture response: 
A picture response shows a picture to the user. 
It has only one property: `url`.
E.g., `{ type="picture", url="${picture_url}" }` (in [Tutorial 3](/doc/thingpedia-tutorial-linkedin.md)).

#### RDL response: 
An RDL response returns a clickable link with a title and a description, suitable for website 
links and news articles.
It has three properties: `webCallback` (the link), `displayTitle` (the title), 
and `displayText` (the description, optional). 
See [Tutorial 1](/doc/thingpedia-tutorial-nyt.md) for an example of this format type.

#### Customized response
If you need more control over the output, such as different output based 
on results, you can choose the type `code` and write Javascript code in the `code` property. 
The code contains an anonymous function expression, which will be invoked with three arguments: 
the result of your function (an object with each parameter as a property), 
a hint informing you of how the result will be shown to the user, 
and a `Formatter` object. 
The function can return a string, a formatted message object 
(with the same structure as the message objects described earlier) 
or an array of objects.
Note that placeholders will __not__ be substituted in the values returned by 
a format function.

The `Formatter` object provides the following properties and methods for your convenience:
- `locale`: the locale (language and country) of the user, e.g. `en-US`
- `timezone`: the timezone identifier of the user, e.g. `America/Los_Angeles`
- `measureToString(value, precision, unit)`: convert a value of `Measure` type to a string.
- `dataToString(date)`: convert a value of `Date` type to a string containing only the date.
- `timeToString(date)`: convert a value of `Date` type to a string containing only the time.
- `dateAndTimeToString(date)`: convert a value of `Date` type to a string containing both the date and the time.
- `locationToString(date)`: convert a value of `Location` type to a string
- `anyToString(object)`: convert any other value to a string (unnecessary for `String` type)

The methods in `Formatter` are wrappers over the native JavaScript functionality (provided by
the [Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl) module)
that automatically set the correct locale and timezone.

Here is an example used in [iCalendar](https://almond.stanford.edu/thingpedia/devices/by-id/org.thingpedia.icalendar).
We want to offer different responses based on if the returned event contains `end_date` or not.
The code looks like this:
```javascript
function({start_date, end_date}, hint, formatter) {
    if (end_date)
        return `The event runs from ${formatter.dateAndTimeToString(start_date)} to ${formatter.dateAndTimeToString(end_date)}`;
    else
        return `The event starts at ${formatter.dateAndTimeToString(start_date)}`;
}
```
And the annotation will look like this: 
```tt
#_[formatted=[{type="code",code="function({start_date, end_date}, hint, formatter) {\nif (end_date)\nreturn `The event runs from ${formatter.dateAndTimeToString(start_date)} to ${formatter.dateAndTimeToString(end_date)}`;\nelse\nreturn `The event starts at ${formatter.dateAndTimeToString(start_date)}`;\n}"}]]
```

**Note**: for security reasons, formatting functions run sandboxed. 
You cannot access other APIs, and cannot use require to import other nodejs modules. 
If you need more complex computation, you should perform it in the query function 
and return the value as a declared parameter.

**Note**: All annotations you provide should assume the American English locale (including e.g. imperial units).
Thingpedia allows translators to provide annotations for other countries and languages. Nevertheless you
should not assume that American English is the default locale at the JS or operating system level, and you
should always pass the user's locale explicitly.
