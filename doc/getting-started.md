# Getting Started with Almond

Welcome to Almond!

This short introduction will teach you the basics of using your Almond.

## What is Almond?

Almond is the magic virtual assistant that you access through your phone. She can
help you configure your things, execute actions on them, install apps based on
your description of the behavior you want.

## What is Thingpedia?

Thingpedia is a research project to collect interfaces and apps for the
Almond virtual assistant. It lives [here](https://thingpedia.stanford.edu/about),
and includes an installation of Almond and ThingSystem (called the Cloud ThingSystem)
as a web service available free of charge to the research community.

## What is ThingSystem?

ThingSystem is a system service that will execute simple "mini-apps" for
your Internet of Things devices and your web accounts. It is the acting
mind behind Almond, and the portion of it that makes stuff happen.

## What can I do with Almond?

Almond will execute commands that use things. Therefore, to have it do anything,
you must associate her with your things, and then give her a command. A command
can be an action (eg. "post on twitter"), a time based rule (eg. "show a popup every 10 minutes")
or a standing query (eg. "monitor xkcd").

## Step-by-step example: Twitter to Almond

This example will guide you through filtering your Twitter feed and redirect
to Almond. At the end of the example, she will tell you about any tweet in your
stream containing the hashtag "sabrina".

### Step 0: Register to Thingpedia

You probably already have an account at
[Thingpedia](https://thingpedia.stanford.edu) (which gives you a running ThingSystem
to follow along these instructions), but if you did
not, you should
[register](/user/register) and then
come back.

### Step 1: Twitter

Go to [My Almond](/me).
You'll see a list of your accounts that your Almond knows about. At this point,
he probably does not know much, so we will teach him about Twitter.

To that extent, just click on
[Add New Account](/me/devices/create?class=online)
and then on
[Twitter Account](/me/devices/oauth2/com.twitter).

After you log in to Twitter and grant premission, you will be redirected to your
Almond page, which now includes Twitter.

### Step 3: Tell Almond what to do

Go to [Web Almond](/me/conversation), which is your conversation interface to Almond.
Write the following to Almond (mind the quotes!)

	notify me if i receive a tweet with hashtag #almondapp

Follow the prompts to confirm, and congrats! You have your first standing query.
Now you will be notified whenever you open Web Almond of all tweets with hashtags \#almondapp
(who would have guessed?).

### Deleting the rule

Whenever you're tired of Almond telling you about your tweets, you can disable the
rule by going in the [your Almond](/me), looking for "Monitor Twitter", and clicking "Stop".

And if you want to stop Almond from touching your Twitter
altogheter, you can also do so from [your Almond page](/me), by forgetting
your Twitter account.

### Inside the engine: the Logs

If you click on [More Details](/status) from the [Developer Portal](/thingpedia/developers),
you will access the status of your engine. In particular, you get access
to the full execution log.
Here, if you make a mistake, and stuff stops working, you can try and figure out why.

Or maybe we made a mistake in writing ThingSystem, in which case, when you
[report a bug](https://github.com/Stanford-IoT-Lab/thingengine-platform-cloud/issues) we will
appreciate seeing the full debug log (don't forget to redact your personal info
away!).
