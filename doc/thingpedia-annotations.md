# Thingpedia Annotation Reference

[[toc]]

## Types of annotations
There are two types of annotations: natural language annotations
and implementation annotations. 
Natural language annotations, as the name suggests, are the annotations related to 
Almond's natural language modules and 
it will be translated to different languages based on users' profile. 
It's denoted by `#_[<key>=<value>]`.
Implementation annotations are used for describing certain implementation characteristics, 
denoted by `#[<key>=<value>]` (without the underscore used by natural language annotations).

## Device class annotations
### `name`
- Type: natural language annotation
- Required: no
- Value type: String

The `name` annotation specifies the name of the device shown in user’s device list. 
By default it will be the same as the name of the device shown in Thingpedia (specified in the metadata).
If you use `config` module from `@org.thingpedia.config.form`, the configuration parameters can be referred
using the syntax `$param` or `${param}`.
See [Authentication & Discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for more details.
               ​
### `description`
- Type: natural language annotation
- Required: no
- Value type: String

The `description` annotation specifies the description of the device shown in user’s device list. 
By default it will be the same as the description of the device shown in Thingpedia (specified in the metadata).
If you use `config` module from `@org.thingpedia.config.form`, the configuration parameters can be referred
using the syntax `$param` or `${param}`. 
See [Authentication & Discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for more details.

### `version`
- Type: implementation annotation
- Required: no
- Value type: Number

The `version` annotation specifies the version of the device in Thingpedia.
This will be automatically generated based on the submit history.  

### `system`
- Type: implementation annotation
- Required: no
- Value type: Boolean

This annotation is only for Almond integrators. It marks the device as a builtin _system_ device,
which will not be shown in Thingpedia. 

## Function annotations
### `doc`
- Type: implementation annotation
- Required: yes
- Value type: String

The `doc` annotation provides a short description of the function, 
as a reference for the developers and reviewers.
​
### `confirmation`
- Type: natural language annotation
- Required: yes
- Value type: String

Before a program is executed, Almond will confirm with the user 
to make sure it understands the command correctly when needed. 
The confirmation sentence comes from the `confirmation` annotation of the function.
Use noun phrases for queries and verb phrases in the imperative form for actions. 
Note that the confirmation sentence should include all the __required__ input parameter,
using the syntax `$param` or `${param}`.

### `poll_interval`
- Type: implementation annotation
- Required: yes (for monitorable queries)
- Value type: `Measure(ms)` (a time interval)

The `poll-interval` annotation specifies how often a query will be fired when it is monitored.
It can only be used for monitorable queries. 
It takes a time interval, such as `5min`, `1h`. 
If the query supports push notification, set the polling interval to `0ms`. 

### `formatted`
- Type: natural language annotation
- Required: no
- Value type: Array

The `formatted` annotation defines how the results will be presented to the user in Almond.
It can only be used for queries. 
If omitted, Almond will simply list the value of all the output parameters one by one 
in the order they are declared in the function signature.
See [Natural Language Support for Devices in Thingpedia](/doc/thingpedia-nl-support.md#output-format) for detailed instructions. 

## Parameter annotations
### `prompt`
- Type: natural language annotation
- Required: no
- Value type: String

The `prompt` annotation provides the slot filling question when
the value of an input parameter is missing in the command.
If omitted, Almond will ask “What's the value of <param>?” 


## Dataset annotations
### `utterances`
- Type: natural language annotation
- Required: yes
- Value type: Array

The `utterances` annotation provides different ways of expressing the corresponding command. 
It is used to generate the training data for the device, and the first utterance in the list
will also be used in [Thingpedia Cheatsheet](/thingpedia/cheatsheet).
See [Natural Language Support for Devices in Thingpedia](/doc/thingpedia-nl-support.md#utterances) for detailed instructions. 