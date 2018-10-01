# Almond Dialog API

The Almond Dialog API allows you to integrate the Almond agent in new UIs, new platforms, or third party products such as Alexa.

This page describes only the abstract interface of the Almond agent.
A concrete interface is provided over [Web Sockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) by [Web Almond](/doc/my-api.md#endpoint-meapiconversation).
Other concrete implementations are provided by the [Alexa bridge](https://github.com/Stanford-Mobisocial-IoT-Lab/thingengine-platform-cloud/blob/master/routes/my_api.js) or by the internal APIs of the platforms that have a UI (e.g. platform-android, platform-gnome).

[[toc]]

## Interaction model

At a high-level, the Almond Dialog API consists of opening a _conversation_, sending some user input, and then receiving some output to present to the user.
The conversation, which is identified in a platform specific manner, consists of all the dialog state known to the agent (such as the partial program being specified by the user, or which slot is being filled).

Each conversation consists of one or more _rounds_.
Each round can be initiated with a user input, such as a ThingTalk program, or with a notification or question from Almond, for example a permission request initiated by a remote user.

In each round, the user provides some input, to which Almond responds with one or messages, followed by a single _ask special_ message, which indicates that Almond is waiting for a response from the user.
The `null` ask special message indicates that Almond does not need a response from the user and terminates the round.

At any point, a round can be terminated by sending a `cancel` special message (as a parsed message, or as textual input, except in certain cases).

Observe that in some cases (e.g. notifications) a round can be initiated and terminated by Almond completely with no interaction from the user.

## Input Modalities

### Text Input

The first form of input is raw text: you pass the unmodified textual command from the user.

In Web Almond, this is represented as a json object with type `command` and a `text` property:
```json
{
  "type": "command",
  "text": "post \"lol\" on twitter"
}
```

### Pre-parsed Command Input

A pre-parsed command is one where the interpretation of the command is passed as input to the agent.
The format of this interpretation is described later.

In Web Almond, this is represented as a json object with type `parsed` and a `json` property holding the parsed commannd. Optionally a `title` property can be added with the corresponding natural language command:
```json
{
  "type": "parsed",
  "title": "Help",
  "json": {
    code: ["bookkeeping","special","special:help"],
    entities: {}
  }
}
```

By convention, in platforms that allow textual user input, a pre-parsed command is entered with the prefix `\r`. For example:

    \r bookkeeping special special:hello

### ThingTalk Code Input

Finally, you can provide the user input as a single ThingTalk program.

In Web Almond, this is json object with type `tt` and a `code` property holding the ThingTalk code:
```json
{
  "type": "tt",
  "tt": "now => @com.twitter.post(status=\"lol\");"
}
```

By convention, platforms with textual user input support raw ThingTalk with the prefix `\t`. For example:

    \t now => @com.twitter.post(status="lol");

(Observe that the quote marks are escaped in JSON but not in the input from the user)

## Almond Outputs

As introduced in the [Interaction Model](#interaction-model), Almond responds to user with one or more output messages, followed by exactly one _ask special_ message.

The following types of output exist.

### Text Message

A simple text message, to be displayed or spoken to the user.
A text message has the following properties:

- `type : string = "text"`
- `text : string`: the text to show to the user
- `icon : string`: the device identifier to use as icon, next to the message; use `https://thingpedia.stanford.edu/thingpedia/api/devices/icon/$icon` to download or display the actual image.

### Picture Message

A single picture, to be displayed to the user.
A picture message has the following properties:

- `type : string = "picture"`
- `url : string`: the URL of the picture
- `icon : string`: the device identifier to use as icon for the message

### RDL Message

A link message, to be displayed to the user, with optional title and description.
An RDL message has the following properties:

- `type : string = "rdl"`
- `rdl : object`: the RDL object, which itself has:
  - `rdl.webCallback : string`: the URL of the link
  - `rdl.displayTitle : string`: the title of the link (optional)
  - `rdl.displayText : string`: the longer description of the link (optional)
- `icon : string`: the device identifier to use as icon for the message

### Button Message

A "button" message is a message that allows the user to click on a pre-parsed command, for example as a suggestion for a ThingTalk program.
A button message has the following properties:

- `type : string = "button"`
- `title : string`: the text to display to the user
- `json : object`: the object corresponding to the parsed command triggered by this button.

Note: you can convert a button message into a valid pre-parsed command message by changing only the `type` property.

### Choice Message

A "choice" message is a message that allows the user to choose one of a list of predefined choices.
It is similar to a button message in how it is expected to be presented to the user, but while a button message
has the same meaning at any point of the conversation, a choice is contextual. At the same time, a choice button can present choices from a set that does not map to any intent in Almond, for example contacts with similar names, or devices of the same type.

A choice message represents only one choice among many. When Almond needs the user to choose from a list, it will send many choice messages in a row, followed by the ask special message asking the user for input. Almond can also send other messages, such as a button message with `back` intent or `more` intent, between the choice messages and the ask special message.

A choice message has the following properties:

- `type : string = "choice"`
- `idx : number`: the numerical index of this choice (typically a small integer, but the client code must not rely on it)
- `title : string`: the main text of the choice button, e.g. the name of the device to choose
- `text : string`: a longer description of the choice (optional)

Because they are contextual, choice messages must be hidden from the user after the user has replied to them. Most platform will also hide button messages after any user interaction, but this is not required.

### Link Message

A "link" message is a button that provides functionality that goes outside the conversation, such as configuring devices or opening the My Almond page.

The most common usage for link messages is to provide a link to the OAuth configuration page for a given device (hence the name). Link messages should not be confused with RDL messages: while RDL messages provide arbitrary links to web pages, link messages only provide navigation within the Almond app.

Link messages are commonly rendered as clickable buttons, while RDL messages are commonly rendered as textual links. Because the expected user response to a link messages (that is, configuring the related device) completes outside of the Almond conversation, most platforms do not hide link messages in response to user interaction.

A link message has the following properties:

- `type : string = "link"`
- `title : string`: the main text of the button
- `link : string`: the relative URL identifying the target of the link.

The following are valid `link` URLs:

- `/user/register`: the user must register before completing the action (only valid in the anonymous API)
- `/apps`: go to My Almond
- `/devices/oauth2/$kind?name=$name`: perform OAuth configuration for a device of type `$kind`; `$name` is the name of the device and is provided to avoid a Thingpedia lookup
- `/devices/configure/$kind?name=$name&controls=$controls`: perform form-based configuration for a device of type `$kind`; `$name` is name of the device and `$controls` is the JSON serialization of the device factory (see the [Thingpedia API](/doc/thingpedia-api) for details)

Apps are encouraged to ignore unexpected link URLs, or to redirect the user to the corresponding page at `https://almond.stanford.edu`.

### Ask Special Message

The ask special messagge completes the current sequence of messages from Almond, and either completes the round or requires the user to provide more information before continuing.

An ask special message has the following properties:

- `type : string = "askSpecial"`
- `ask : ?string`: what Almond is asking for.

The following are valid values for the `ask` property:

- `null`: complete the round; Almond is not asking for anything and is now in the default state. Note that this is the JSON value `null`, not the string `"null"`.
- `yesno`: Almond asks a yes/no question
- `picture`: Almond would like the user to choose or upload a picture
- `phone_number`, `email_address`: Almond expects the user to input a value of the given type (typically by choosing from the contact book)
- `contact`: Almond asks for either a phone number or a email address
- `number`: the user should input a number
- `date`: the user should choose a date
- `time`: the user should choose a time of day
- `raw_string`: the user should enter some free-form text (e.g. the body of an email message)
- `choice`: the user should choose from the list of choice messages that Almond just sent
- `command`: the user should type a command (this is only used when constructing programs interactively and is mostly free-form)
- `generic`: Almond is expecting some other input, not in the list above. The round is not complete, but the client should present only a generic input interface.

Note: after sending a `raw_string` ask special message, Almond enters “raw” mode. In this mode, all text inputs from the user are treated as responses, including inputs that normally would control the interaction such as “yes”, “no” or “cancel”. To use those commands while in raw mode, you must use a pre-parsed command.

## Format of Almond parsed commands

An Almond parsed command is a JSON object, with the following properties:

- `code : Array<string>`: a ThingTalk program in pre-tokenized form, or a bookkeeping intent specification
- `entities : object`: the concrete values that are used by the ThingTalk code
- `example_id : number`: (optional) the ID of the example command in the database corresponding to this button; used for tracking which commands are more popular
- `slots : Array<string>`: the parameters which have been replaced by `SLOT` specifications in the ThingTalk code
- `slotTypes : object`: a map from parameter name to ThingTalk type, for all unspecified parameters which have been replaced by the `SLOT` syntax

### Useful special commands

The follow pre-parsed commands can be issued at any time to exhance the Almond UI:

 * `{"special":{"id":"tt:root.special.yes"}}`: yes (when Almond expects a yes/no)
 * `{"special":{"id":"tt:root.special.no"}}`: no (when Almond expects a yes/no)
 * `{"special":{"id":"tt:root.special.nevermind"}}`: cancel and reset Almond
 * `{"special":{"id":"tt:root.special.train"}}`: enter training mode, letting the user override the interpretation of a command
 * `{"special":{"id":"tt:root.special.help"}}`: show help; when Almond expects an answer, this will tell the user what Almond expects
 * `{"special":{"id":"tt:root.special.debug"}}`: show debug statistics
