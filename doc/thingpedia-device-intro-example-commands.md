# Writing Example Commands for Your Device

## Basic Queries and Actions 

noun phrase
```
let table x := @<Thing ID>.<channel name>()
```

## Lambda Expression

## Filters

## Stand-alone Examples
All the examples introduced above can be combined and compose more complicated sentences 
by concatenating the natural language utterances with some conjunctions.
However, in some cases, you might want a very specific utterance for your command 
it won't be natural to use as part of some other sentences.
In this case, you can add a comma at the beginning of your ThingTalk code, which will tell
the system that this is a stand-alone command and will not be used to compose compounds. 

For example, if we want a stand-alone command "_what's the weather?_", 
to avoid being concatenating this complete sentence with other things, we can write the following ThingTalk code with comma in front:


use `,` or just write a complete program? 