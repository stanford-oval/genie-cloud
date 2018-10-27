# Natural Language Support for Devices in Thingpedia

[[toc]]

Almond runs command in ThingTalk, but it speaks English. 
In the following, we will introduce how to get the best natural language support from us
so that Almond understands users' commands related to your device
and present the results to the users properly. 

## Natural language understanding
When creating a new device, a dataset files containing example commands is required. 
These example commands provide the training data for your device. 
The natural language understanding ability of Almond heavily relies on the quality 
and quantity of the examples. 

## Example commands
A dataset contains ThingTalk commands and their corresponding utterances. 
The syntax is as follows:
```tt
query := @com.thecatapi.get();
#_[utterances=["a cat picture","a random cat picture","cats"]];
```
An `utterances` annotation is used. It takes a list of strings to present different ways of expressing the command

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
code snippet to form a full program. 


- stream: when clause
- query: noun phrase
- action: verb phrase in the imperative form

### Other tips and tricks
- `canonical` annotation for function name and parameter name

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