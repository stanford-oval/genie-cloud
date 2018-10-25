# Introduction to Almond and Thingpedia

[[toc]]

## What is Almond?
Almond is a smart virtual assistant that you can access through 
your phone and the [web](/about/get-almond). It helps you configure your devices, accounts, 
and public services, retrieve data from them, and execute actions on them.

## What is Thingpedia?
Almond builds on top of [Thingpedia](https://thingpedia.stanford.edu/), 
an encyclopedia of applications for the Internet services and IoT devices. 
Just like how Wikipedia stores knowledge about the world, 
Thingpedia stores knowledge about devices in the world. 
Wikipedia is organized around articles; 
Thingpedia is organized around devices, such as Twitter, a light bulb, or a thermostat.
It creates an interoperable web of devices and let users program them in 
natural language. 
(We use the term _device_ to refer to both IoT devices and Internet services.)

A device in Thingpedia can have two types of functions: _query_ and _action_.
Queries are free of side-effects and can return results,
and actions have side effects, and cannot return results.
Users can connect different queries and actions to accomplish 
complicated tasks with a single command, such as 
"Get my latest Instagram picture and post it on Twitter".


## How Almond works? 
Almond virtual assistant has two major components:
_Almond agent_ which communicates with the users in natural language, and
_Almond engine_ which runs the commands issued by the users. 
The following diagram illustrates how Almond works internally.
![architecture](/images/thingengine-arch.svg)

1. A user issues a command, say "get my recent tweets", in English.

2. Almond agent translates the command to the corresponding [ThingTalk](/doc/thingtalk-intro.md) program 
and send it to Almond engine.

3. If the user has Twitter set up in his Almond, go to step 6. Otherwise, Almond engine requests
the Twitter interface from Thingpedia.

4. Thingpedia returns the Twitter interface, and Almond engine run the ThingTalk program with the interface returned. 

5. If needed, Almond prompts to the user to do authentication. For Twitter, user will be redirected
to OAuth page to link his account to Almond. 

6. Then Almond engine will call the Twitter API and get the result from Twitter.

7. The result will be reported to Almond agent.

8. Almond agent will send the result to the user.

## How to create a new device in Thingpedia?
We prepared a series of tutorials to show you how to create devices in Thingpedia. 
Two major components, `manifest.tt` and `dataset.tt`, are needed.
`manifest.tt` contains the manifest of the device, describing what the device does, including the 
authentication method, the signature of the functions;
`dataset.tt` contains example command-utterance pairs for training the natural language
parser. 

If the device you want to create gets results from a standard RSS Feed
or RESTful APIs in JSON, these two files are sufficient 
(see [Tutorial 1](/doc/thingpedia-tutorial-nyt.md) for an example).
If you want customized behavior, such as customized authentication, computation on the returned
results from the API endpoints, you can submit a Javascript package to describe 
the behavior of your device as well. 
See [Tutorial 2](/doc/thingpedia-tutorial-cat.md) and 
[Tutorial 3](/doc/thingpedia-tutorial-linkedin.md) for examples.  

