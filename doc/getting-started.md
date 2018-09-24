# Getting Started with Almond

Welcome to Almond!

This short introduction will teach you the basics of using your Almond.

[[toc]]

## What is Almond?

Almond is the magic virtual assistant that you access through your phone. She can
help you configure your things, execute actions on them, install apps based on
your description of the behavior you want.

## What is Thingpedia?

Thingpedia is a research project to collect interfaces and apps for the
Almond virtual assistant. It lives [here](https://thingpedia.stanford.edu/),
and includes an installation of Almond as a web service available free of charge
to the research community.

## What can I do with Almond?

Almond will execute commands that use things. Therefore, to have it do anything,
you must associate her with your things, and then give her a command. A command
can be an action (eg. "post on twitter"), a time based rule (eg. "show a popup every 10 minutes")
or a standing query (eg. "monitor xkcd").

## Step-by-step example: Twitter to Almond

This example will guide you through filtering your Twitter feed and redirect
to Almond. At the end of the example, she will tell you about any tweet in your
stream containing the hashtag "sabrina".

### Step 0: Register for Web Almond

You probably already have an account at
[almond.stanford.edu](https://almond.stanford.edu), but if you did
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
Write the following to Almond.

	notify me if i receive a tweet with hashtag #almondapp

Follow the prompts to confirm, and congrats! You have your first standing query.
Now you will be notified whenever you open Web Almond of all tweets with hashtags \#almondapp.

### Deleting the rule

Whenever you're tired of Almond telling you about your tweets, you can disable the
rule by going in the [your Almond](/me), looking for "Twitter ⇒ Notification", and clicking "Stop".

And if you want to stop Almond from touching your Twitter
altogheter, you can also do so from [your Almond page](/me), by forgetting
your Twitter account.
