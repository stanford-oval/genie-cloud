# Getting Started with Sabrina

Welcome to Sabrina!

This short introduction will teach you the basics of using your Sabrina.

## What is Sabrina?

Sabrina is the magic virtual assistant that you access through your phone. She can
help you configure your things, execute actions on them, install apps based on
your description of the behavior you want.

## What is ThingEngine?

ThingEngine is a system service that will execute simple "mini-apps" for
your Internet of Things devices and your web accounts. It is the acting
mind behind Sabrina, and the portion of it that makes stuff happen.

You can get a taste of the kinds of apps that can run in ThingEngine if
you go to our list of recommended apps in [ThingPedia](https://thingengine.stanford.edu/thingpedia/apps),

## What is ThingPedia?

ThingPedia is a research project to collect interfaces and apps for the
Sabrina virtual assistant. It lives [here](https://thingengine.stanford.edu/about),
and includes an installation of Sabrina and ThingEngine (called the Cloud ThingEngine)
as a web service available free of charge to the research community.

## What can I do with Sabrina?

Sabrina will execute apps that use things. Therefore, to have it do anything,
you must associate her with your things, and tell her what apps
to run by choosing them from ThingPedia.

## Step-by-step example: Twitter to Sabrina

This example will guide you through filtering your Twitter feed and redirect
to Sabrina. At the end of the example, she will tell you about any tweet in your
stream containing the hashtag "sabrina".

### Step 0: Register to ThingPedia

You probably already have an account at
[ThingPedia](https://thingengine.stanford.edu) (which gives you a running ThingEngine
to follow along these instructions), but if you did
not, you should
[register](/user/register) and then
come back.

### Step 1: Getting Sabrina

Sabrina uses [Omlet](http://omlet.me) to communicate. Omlet is a chat
app developed by MobiSocial, Inc., and you can download it for
[iPhone](https://itunes.apple.com/us/app/omlet/id682042134?ls=1&mt=8)
or
[Android](https://play.google.com/store/apps/details?id=mobisocial.omlet).

Note that you don't need to install the ThingEngine App on your phone, so
Sabrina works with iOS too (even though there is no ThingEngine for iOS yet).
Unfortunately, there is no support for Windows Phone yet.

In the configuration of Omlet you must also link it to Google, Facebook or
Baidu. You can do that from the profile in the Omlet App. This is a technical
limitation that we hope to overcome soon.

After you obtained Omlet, you should log in to your ThingEngine account, then
[activate your Omlet account](/devices/oauth2/org.thingpedia.builtin.omlet).
At the end of the procedure, your Sabrina should be greeting you through your
phone. Answer her questions before moving on, or say "no" to continue.

### Step 2: Twitter

Go to [My Sabrina](/apps).
You'll see a list of your accounts that your Sabrina knows about. At this point,
he probably knows about your Omlet, but we need to teach him about Twitter as well.

To that extent, just click on
[Add New Account](/devices/create?class=online)
and then on
[Twitter Account](/devices/oauth2/com.twitter).

After you log in to Twitter and grant premission, you will be redirected to your
Sabrina page, which now includes Twitter too.

### Step 3: Creating the App

From [your Sabrina](/apps), click on
[Create New App](/thingpedia/apps/create) in
 and copy-paste the following code in the _App Specification_ field:

    TwitterTutorial() {
      @twitter.source(text, hashtags, _, from, _, _), $contains(hashtags, "sabrina")
        => @$notify("Tweet from " + from + ": " + text);
    }

Pick a name and a description, then click "Create", and you will see the app right
after your accounts. Don't worry about the name or the description you chose - nobody
is seeing them yet until you click "Publish"!

### Step 4: Enabling the App

Finally you are ready to enable the app that will actually do the hard-work
of filtering your Twitter.

Just click on the app name from [your Sabrina page](/apps), confirm that
you want to enable the app, and you're done! Your Sabrina should be telling you
who is tweeting about her among your friends.

### Deleting the app

Whenever you're tired of Sabrina telling you about your tweets, you can disable the
app by going in the [your Sabrina](/apps), looking for it, and clicking "Stop".

And if you want to stop Sabrina from touching your Twitter
altogheter, you can also do so from [your Sabrina page](/apps), by forgetting
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

### Further Reading:

* [ThingTalk Primer](/doc/thingtalk-intro.md): a more in-depth introduction to the language
* [ThingTalk Reference](/doc/thingtalk-reference.md): the full ThingTalk reference manual
