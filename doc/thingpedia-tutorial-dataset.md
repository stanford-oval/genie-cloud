# Write Example Commands for Your Device

To get natural language support, 
a `dataset` is required to supply example commands for your device. 
In the following, we will continue using The Cat API as an example. 
Its `dataset.tt` file looks like this:

```tt
dataset @com.thecatapi {
    query  := @com.thecatapi.get()
    #_[utterances=["a cat picture","a random cat picture","cats"]];

    query (p_count :Number)  := @com.thecatapi.get(count=p_count)
    #_[utterances=["${p_count:const} cat pictures"]];
}
```

Similar to the device class, the name of the dataset is as defined in the device metadata 
with the `@` sign. 

Instead of writing full programs, we write parts using code snippet syntax introduced in 
[ThingTalk introduction](/doc/thingtalk-intro.md#code-snippet), plus the `utterances` 
natural language annotation.
(See [code snippet vs full program](/doc/thingpedia-nl-support.md#code-snippet-vs-full-program) 
for a comparison between the two.)

The `utterances` annotation takes a list of strings to show different ways to 
express the same function. 
Similar to the `confirmation` annotation for functions as introduced in device class, 
the corresponding utterance of a query should be a noun phrase, and the one of 
an action should be a verb phrase in the imperative form.

Arguments can also be used in the dataset, and they can be referred in the 
utterances with `$argname` as in the second example provided in the dataset for The Cat API.

A query can be monitored to create a _stream_ if it's marked as monitorable.
For example, a stream to monitor my latest emails can be declared as follows:
```tt
stream := monitor (@com.email.inbox())
#_[utterances=["when i receive an email", "when a new email comes in"]];
```

More details about can be found in 
[Natural Language Support for Devices](/doc/thingpedia-nl-support.md#natural-language-understanding).