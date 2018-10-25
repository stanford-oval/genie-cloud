# Introduction to Almond and Thingpedia

[[toc]]

## What is Almond?
Almond is a smart virtual assistant.
It has an [Android version](https://play.google.com/store/apps/details?id=edu.stanford.thingengine.engine) 
and a [web version](\me).

## What is Thingpedia?
[Thingpedia](https://thingpedia.stanford.edu) is where Almond draws the power from. 
It's an open, crowdsourced repository for APIs.

Each entry on Thingpedia is called _device_.
We use the term _device_ to refer to both IoT device and web service.
A device can have two types of functions: query and action.
Queries are free of side-effects and can return results,
and actions have side effects, and cannot return results.

## How Almond works? 

Almond virtual assistant draws its power from [Thingpedia](https://thingpedia.stanford.edu).
Once a device is submitted to Thingpedia, its functions can be used in Almond. 

The following diagram illustrates how Almond works internally.
![architecture](/images/thingengine-arch.svg)


1. User issues a command, say "get my recent tweets", in English

2. Almond translates the command to the corresponding [ThingTalk]() program

3. If the user has Twitter set up in his Almond, go to step 6. Otherwise, ThingEngine requests
the Twitter interface from Thingpedia.

4. Thingpedia returns the interface requested to ThingEngine, and ThingEngine will install it 
for the user. 

5. If needed, Almond prompts to the user to do authentication. For Twitter, user will be redirected
to OAuth page to link his account to Almond. 

6. Then ThingEngine will call the corresponding Twitter API and get result from Twitter.

7. The result will be reported to Almond.

8. Almond will send the result to user.

## How to create a new device in Thingpedia?
To create a device in Thingpedia.

### Metadata for Thingpedia Catalog
The information is used to show your device in Thingpedia and user's Almond. 

### Device manifest
Device manifest specifies what your device does.
The function signature, the parameters.

We also provided some modules to bootstrap 

### Natural language data
