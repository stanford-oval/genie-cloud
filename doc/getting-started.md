# Getting Started with Almond

Welcome to Almond!

This short introduction will teach you the basics of using your Almond.

## What is Almond?

Almond is the magic virtual assistant that you access through your phone. She can
help you configure your things, execute actions on them, install apps based on
your description of the behavior you want.

## What is ThingEngine?

ThingEngine is a system service that will execute simple "mini-apps" for
your Internet of Things devices and your web accounts. It is the acting
mind behind Almond, and the portion of it that makes stuff happen.

You can get a taste of the kinds of apps that can run in ThingEngine if
you go to our list of recommended apps in [Thingpedia](https://thingengine.stanford.edu/thingpedia/apps),

## What is Thingpedia?

Thingpedia is a research project to collect interfaces and apps for the
Almond virtual assistant. It lives [here](https://thingengine.stanford.edu/about),
and includes an installation of Almond and ThingEngine (called the Cloud ThingEngine)
as a web service available free of charge to the research community.

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
[Thingpedia](https://thingengine.stanford.edu) (which gives you a running ThingEngine
to follow along these instructions), but if you did
not, you should
[register](/user/register) and then
come back.

### Step 1: Getting Almond

Almond uses [Omlet](http://omlet.me) to communicate. Omlet is a chat
app developed by MobiSocial, Inc., and you can download it for
[iPhone](https://itunes.apple.com/us/app/omlet/id682042134?ls=1&mt=8)
or
[Android](https://play.google.com/store/apps/details?id=mobisocial.omlet).

Note that you don't need to install the ThingEngine App on your phone, so
Almond works with iOS too (even though there is no ThingEngine for iOS yet).
Unfortunately, there is no support for Windows Phone yet.

In the configuration of Omlet you must also link it to Google, Facebook or
Baidu. You can do that from the profile in the Omlet App. This is a technical
limitation that we hope to overcome soon.

After you obtained Omlet, you should log in to your ThingEngine account, then
[activate your Omlet account](/devices/oauth2/org.thingpedia.builtin.omlet).
At the end of the procedure, your Almond should be greeting you through your
phone. Answer her questions before moving on, or say "no" to continue.

### Step 2: Twitter

Go to [My Almond](/apps).
You'll see a list of your accounts that your Almond knows about. At this point,
he probably knows about your Omlet, but we need to teach him about Twitter as well.

To that extent, just click on
[Add New Account](/devices/create?class=online)
and then on
[Twitter Account](/devices/oauth2/com.twitter).

After you log in to Twitter and grant premission, you will be redirected to your
Almond page, which now includes Twitter too.

### Step 3: Tell Almond what to do

From your Omlet, write the following to Almond (mind the quotes!)

	notify me if i receive a tweet with hashtag "sabrinaapp"

Follow the prompts to confirm, and congrats! You have your first standing query.
Now you will be notified in your Omlet of all tweets with hashtags \#sabrinaapp
(who would have guessed?)

### Deleting the rule

Whenever you're tired of Almond telling you about your tweets, you can disable the
rule by going in the [your Almond](/apps), looking for "Monitor Twitter", and clicking "Stop".

And if you want to stop Almond from touching your Twitter
altogheter, you can also do so from [your Almond page](/apps), by forgetting
your Twitter account.

### Inside the engine: the Logs

If you click on [More Details](/status) from the [Developer Portal](/thingpedia/developers),
you will access the status of your engine. In particular, you get access
to the full execution log.
Here, if you make a mistake, and stuff stops working, you can try and figure out why.

Or maybe we made a mistake in writing ThingEngine, in which case, when you
[report a bug](https://github.com/Stanford-IoT-Lab/ThingEngine/issues) we will
appreciate seeing the full debug log (don't forget to redact your personal info
away!).
