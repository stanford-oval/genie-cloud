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
It takes a list of strings where parameters can be referred by `$param` or `${param}`.

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
Unlike most of the other programming languages, parameter names and function names matter 
in ThingTalk: they are used for generating synthetic sentences. 

To make the synthetic sentences more natural, you can use `canonical` annotations
to provide how the parameter will be expressed in natural language.  

## Response with natural language
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

### Output format
When a stream or a query is combined with the action `notify`, 
the returned results will be presented to the user in Almond. 
By default, Almond will simply list the value of all the output parameters one by one 
in the order they are declared in the function signature.