# Writing Example Commands for Your Device

## Composable Examples
ThingTalk can compose multiple primitive commands to create a complicated compound command. 
To leverage the full power of ThingTalk, we recommend to write composable example commands as follows.

Instead of writing full programs, write parts using lambda syntax introduced in [ThingTalk introduction](/doc/thingtalk-intro.md).
Use twitter as an example. The query to get tweets in my timeline can be declared using the following syntax. 
```JSON
let table x := @com.twitter.home_timeline();
```
The corresponding utterance of a query should be a __noun phrase__. In this case, it should be `tweets from anyone i follow` or `tweets from my timeline`.
When we compose the sentence, we will add generic verbs before the noun phrase such as `get`, `show`.
If you want to use a non-generic verb, put a comma `,` before your utterance. For example get the translation of some text might want to use the command-specific verb `translate`,
thus we can write the utterance as "_, translate the text_".

For streams like the following one, write the utterance in as a __when phrase__: "_when i tweet_".
```JSON
let stream x := monitor (@com.twitter.my_tweets());
```

For actions, just write the full sentence. So the following sentence will have utterance like "_post `${p_status}` on twitter_" or "_tweet `${p_status}`_".
Note that, for all examples, the arguments of the lambda expression should be named by the original argument name defined in the channel
with a prefix of `p_`.
```JSON
let action x := \(p_status :String) -> @com.twitter.post(status=p_status);
```



## Stand-alone Examples
All the examples introduced above can be combined and compose more complicated sentences 
by concatenating the natural language utterances with some conjunctions and verbs.
However, in some cases, you might want a very specific utterance for your command,
or even an example for compound command, which won't be natural to use as part of some other sentences. 
In this case, one can write the full program.

For example, if we want a stand-alone command "automatically retweet anyone i follow", 
to avoid being composed, we can write the following ThingTalk program
instead of the lambda expression:
```JSON
monitor (@com.twitter.home_timeline()) => @com.twitter.retweet(tweet_id=tweet_id);
```