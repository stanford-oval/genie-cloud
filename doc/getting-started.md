# Getting Started with Almond

Welcome to Almond!

This short introduction will teach you the basics of using your Almond.

[[toc]]

## What is Almond?

Almond is the magic virtual assistant that you can access through both of 
your phone and the [web](/me). It can help you configure your devices, accounts, 
and public services, retrieve data from them, and execute actions on them.
It also allows you to easily share your data with your friends and families 
with control in your hand. 
Oh, btw, it's open-sourced and it protects your privacy!

## What is Thingpedia?

Almond builds on top of [Thingpedia](https://thingpedia.stanford.edu/), 
an encyclopedia of applications for the Internet services and IoT devices. 
Just like how Wikipedia stores knowledge about the world, 
Thingpedia stores knowledge about devices in the world. 
Wikipedia is organized around articles; 
Thingpedia is organized around devices, such as Twitter, a light bulb, or a thermostat.
It creates an interoperable web of devices and let users program them in 
natural language. 

## What can I do with Almond?

Almond draws the power from Thingpedia. 
It supports simple commands including 
actions (eg. `post on twitter`),
time-based rules (eg. `tweet every hour`),
one-time queries (eg. `search tweets`),
and standing queries (eg. `monitor new tweets`).
On top of one-time queries and standing queries, filters can be used to further refine 
the commands (eg. `search tweets from bob`, `monitor new tweets about almond`).

Almond also supports compound commands which interoperate functions from different devices.
For example, you can ask Almond to `send me a slack message if bob tweets`, 
`create a meme and tweet it`.

## Step-by-step example: Twitter to Almond

This example will guide you through filtering your Twitter feed and redirect
to Almond. At the end of the example, it will tell you about any tweet in your
stream containing the hashtag "almondapp".

### Step 0: Register for Almond

You probably already have an account at
[almond.stanford.edu](https://almond.stanford.edu), but if you did
not, you should
[register](/user/register) and then
come back.

### Step 1: Twitter

Go to [My Almond](/me).
You'll see a list of your accounts that your Almond knows about by clicking on
"Device and Accounts". At this point, it probably does not know much, so we will 
teach him about Twitter.

To that extent, just click on
[Add New Account](/me/devices/create?class=online)
and then on
[Twitter Account](/me/devices/oauth2/com.twitter).

After you log in to Twitter and grant permission, you will be redirected to your
Almond page, which now includes Twitter.

### Step 3: Tell Almond what to do

Now Almond connects to your Twitter account. 
You can use the chat interface under [My Almond](/me) to write the following to Almond.

`notify me if i receive a tweet with hashtag #almondapp`

Follow the prompts to confirm, and congrats! You have your first standing query.
Now you will be notified whenever you open Web Almond of all tweets with hashtags \#almondapp.

Some other commands you can try:
- get recent tweets from users you follow: `get tweets`
- get your recent tweets: `get my tweets`
- post "hello" on your Twitter (if you don't mind): `tweet hello`
- follow our Twitter account: `follow @almondstanford on Twitter` 

Whenever you're tired of Almond telling you about Almond tweets, you can disable the
rule by going to "Active Commands" section under [my Almond](/me), 
looking for "Twitter ⇒ Notification", and clicking "Stop".

And if you want to stop Almond from touching your Twitter altogether, 
you can also do so from [your Almond page](/me), by forgetting your Twitter account.
