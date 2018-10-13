# Writing Device Class in ThingTalk
Device class describes how the device will be loaded by the system, how it will be configured, 
and what it does - the thingpedia functions. 
In the following, we will use LinkedIn as an example to show you how to write your own device class.

```tt
class @com.linkedin {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.oauth2(client_id="75j2y6wjan5rt2", client_secret="EhAay6Leb69T78yK");

  monitorable query get_profile(out formatted_name: String,
                                out headline: String,
                                out industry: String,
                                out specialties: String,
                                out positions: Array(String),
                                out profile_picture: Entity(tt:picture))
  #_[canonical="get profile on linkedin"]
  #_[confirmation="your LinkedIn profile"]
  #_[confirmation_remote="$__person's LinkedIn profile"]
  #_[formatted=[
      {type="text",text="${formatted_name}"}, 
      {type="text",text="${headline}"}, 
      {type="picture",url="${profile_picture}"}, 
      {type="text",text="Works in ${industry}"}]
  ]
  #[poll_interval=86400000ms]
  #[doc="retrieve your LinkedIn profile"];

  action share(in req status: String #_[prompt="What do you want to post? Include a link to a page."])
  #_[canonical="post on linkedin"]
  #_[confirmation="share $status on your LinkedIn"]
  #_[confirmation_remote="share $status on $__person's LinkedIn"]
  #[doc="share a comment and a link "];
}
```

## Basic Syntax

### Statements
The name of a device class is as defined in the device manifest with an additional `@` 
sign at the beginning. The device class has two statements:
- `import` statements to import `loader` and `config` module from mixins to specify how the device will be loaded 
by the system and how it will be configured/authenticated, respectively. 
- function declaration statements to describe the behavior of each thingpedia function. 

Each statement ends with a semicolon. 

### Annotations
Annotations are used to provide additional information to the corresponding code. 
Annotations always comes after the corresponding code, and it has two different types:
- natural language annotation: annotations that related to natural language, and will be translated to 
different languages based on users' profile. It's denoted by `#_[<key>=<value>]`.
- implementation annotation; annotations that describe how the command will be executed. 
This is denoted by `#[<key>=<value>]` (without the underscore as in natural language annotation)

## Imports
The syntax to import a module is as follows:
```
import <module> from <mixin>(<params>);
```

Two modules are required for each device class: `loader` and `config`. 

### `loader`
Loader defines the package type of the device. It decides how the system handles the device.
Loader can be imported from a list of supported mixins: 
- `@org.thingpedia.v2`
- `@org.thingpedia.rss` 
- `@org.thingpedia.generic_rest.v1`

`@org.thingpedia.v2` is the default type for `loader` and it's what most of the devices are using.
It allows users to provide additional package of javascript code to customize the 
behavior of the device.  

On the other hand, `@org.thingpedia.rss` and `@org.thingpedia.generic_rest.v1` gives 
users the ability to write a device with relative standard and simple interface without any JS code. 
For services retrieving data from RSS feed, `@org.thingpedia.rss` could be used.
While if a service only uses simple HTTP request methods, `@org.thingpedia.generic_rest.v1` can be used.

Note that both `@org.thingpedia.rss` and `@org.thingpedia.generic_rest.v1` can be fulfilled
using `@org.thingpedia.v2` with additional javascript code.

For more details, please refer to [declarative Thingpedia entries](/doc/thingpedia-device-with-zero-code.md). 

### `config`
Similar to `loader`, a `config` module can be imported from a list of mixins: 
- `org.thingpedia.config.none`
- `org.thingpedia.config.discovery`
- `org.thingpedia.config.form`
- `org.thingpedia.config.oauth2`
- `org.thingpedia.config.custom_oauth`

Refer to [complete guide for authentication and discovery](/doc/thingpedia-device-intro-auth-n-discovery.md) for more details. 

## Function declarations

### Queries and Actions

The user interacts with your Thingpedia device through two types of functions: queries and actions. 
Thus, the first step is to decide on what queries and actions you should expose.

The only requirement imposed from Thingpedia is that queries are free of side-effects and can return results (as output arguments),
and actions have side effects, and cannot return results. Other than that, the design of which functions to include is highly device specific.
At a high level, you should keep in mind the following guidelines to achieve the best natural language results:

- queries should be designed to return a list of results, one for each element that
  the user can operate on; arguments should refer to the single value for each result;
  for example, to return a list of blog posts, design a query called `posts` with arguments
  `title` and `link` - each argument refers to a single post only
- if some natural language command can be ambiguous between two functions, you must
  merge the functions together and distinguish them by a parameter;
  for example, rather than having `com.mynewspaper.world` and `com.mynewspaper.opinions`, use
  `com.mynewspaper.get` with a `section` parameter, so the user can leave the section ambiguous
- if some functionality can be achieved in ThingTalk using filters, you cannot have it
  as a function too;
  for example, rather than `com.example.search_by_author`, you should use `com.example.search`
  and use a filter on the `author` parameter

### Arguments
To take full advantage of the functionality we provided in ThingTalk (filtering, chaining, etc.),  
every argument needed for ___both input and output___ should be listed here. 
An argument is described as follows: 
```
[in req | in opt | out] <name> : <type> (#_[prompt=<slot-filling-question>])? 
```  

- An argument can be either `in req` (required input), `in opt` (optional input), or `out` (output).
- `name`: the name of the argument, which we suggest to name with lower case 
  letters with underscores between each word.
- `type`: the type of the argument including: String, Number, Boolean, Date, Time, Location,
Entity(...), Enum(...), Measure(...), etc.
  For the full list, see the [ThingTalk reference](/doc/thingtalk-reference.md)
- `prompt`: if an argument is required and missing in the command, the user will be asked a question to fill the slot.
  This is described as a natural language annotation, and it's optional - a default question 
  "what's the value of `<name>`?" will be asked if omitted. 
  
For instance, in the LinkedIn example shown above, action `share` has a required input argument 
of type `String` called `status`. It is described as follows.
```
in req status: String #_[prompt="What do you want to post? Include a link to a page."]
```

#### Argument Name Conventions

The choice of argument name is important because it affects the natural language translation.
To achieve the best accuracy, you should the same argument names as other similar devices, and you
should follow these conventions:

- if your function returns a picture as the main result, name the argument `picture_url`
- if your function accepts a picture as input, name the argument `picture_url`
- if your function accepts any URL, name the argument `url`; if it accepts any URL of videos, name it `video_url`
- if your function returns an article or link, name the title `title`, the blurb or description `description`,
  the URL `link`, the update date `updated` and the author name `author`
- if your function accepts a query string to search, name it `query`
- if your function allows you to upload a picture with a short description, name the description `caption` and
  the picture `picture_url`
- if your function takes a free-form string to be posted on social media, name it `status`
- if your function takes two free-form strings to be posted on social media, name them `title` and `body`
- if your function turns on or off your device, name the function `set_power`, name the argument `power` and make it of type `Enum(on,off)`
- if your function takes a numeric range as input, name the lower bound `low` and the upper bound `high`
- if your function returns multiple results, and you can control the number of results returned, use a `count` parameter of type `Number`

### Natural language annotations for functions
#### Canonical Form
The canonical form of the function name, used by the semantic parser (certain versions);
it's a good idea to omit stop words for this, and to use a longer expression
such as `set target temperature on thermostat`. You must omit all parameters and filters
from the canonical form.

#### Local/Remote Confirmation String:
A string used to construct the final confirmation question before a rule is created
or an action is invoked. For actions, use the imperative form, e.g. “post on My Social Network”,
and for query use the noun-phrase form e.g. “the latest posts in your feed”.
You can refer to required arguments with `$argname` or `${argname}` (the latter is only needed if
the argument is immediately followed by a letter number or underscore).

The remote confirmation is optional; if given, it is used to confirm commands that refer to other
user's devices (_remote commands_). The owner of the device can be referred by `$__person`.

#### Formatted output: 
This field specifies how the results will be presented to the user.
It contains a list of outputs which will be shown to the users in order.

Depending on the type of output, you must fill different properties, by enabling
them from the JSON editor. In each property, input and output parameters of the function can be referred to
by using the syntax `$argname` or `${argname}`. If a parameter is of type `Measure`, the unit can be specified by `${argname:unit}`.
If a parameter is a `Number`, you can have it formatted as percentage as `${argname:%}`.
If a parameter is a `Date`, you can use `${argname:date}` to show just the date, and `${argname:time}` to show just the time.

Valid types of output include
    - `text`: a simple text or voice message; this output type has only one property: `text` (“Message” in the editor).
    - `picture`: shows a picture to the user; this output type has one property: `url` (“Picture URL” in the editor).
    - `rdl`: returns a clickable with optional title and description link, suitable for website links and news articles
      you must specify the property `webCallback` (“Link URL”), `displayTitle` (“Link Title”) and `displayText` (“Link Text”).
    - `code`: if you need more control over the output, such as different output based on results, you can choose this type and write Javascript code in the `code` property (“Formatting Function” in the editor). The result function will be invoked with three arguments: the result of your function (an object with each argument as a property), a hint informing you of how the result will be shown to the user, and a `Formatter` object. The function can return a string, a formatted message object (with the same structure as the JSON described here) or an array of objects. See [https://github.com/Stanford-Mobisocial-IoT-Lab/ThingTalk/blob/master/lib/formatter.js] for details.

### Implementation annotations for functions
#### Doc String
This is only used for documentation for developers. 

#### Polling interval: 
Queries may be monitored.
For example, the command to query the current weather can monitored, so that whenever the weather changes,
users will be notified. 
Polling interval field takes an integer in milliseconds to specify how often the query will be fired 
to check if any change happened.

If your query supports push notifications, leave the polling interval as `0`.
If the query returns non-deterministic results (e.g., a random number), set polling interval to `-1`,
which will prevent the user from monitoring it.


### Other Annotations
All the devices configured by a user will be shown in the user's [My Almond](/me).
A name and a short description are required for each device. 
Typically this information is provided in the JS code which will introduce later.
But if you choose `RSS Feed` and `Generic REST` as your package type, you need to specify 
them in the manifest.
To do so, click the `Properties` button at the top level of the JSON editor and tick the boxes for 
`User visible name` and `User visible description`, and fill them in. 
