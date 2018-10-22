# Writing Device Class in ThingTalk

[[toc]]

Device class describes how the device will be loaded by the system, how it will 
be configured, and what it does. 
In the following, we will continue using The Cat API as an example to illustrate 
how to write your own device class. The device class of it looks like this:

```tt
class @com.thecatapi {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  query get(in opt count: Number,
            out image_id: Entity(com.thecatapi:image_id),
            out picture_url: Entity(tt:picture),
            out link: Entity(tt:url))
  #_[canonical="get cat on thecatapi"]
  #_[confirmation="cat pictures"]
  #[doc="get `count` many cat pictures"];
}
```
The name of a device class is as defined in the device metadata with an additional `@` 
sign in front. The device class has two types of statements: import statements and function declaration statements.
Each statement terminates with a semicolon. 

## Import statements
The import statements import modules `loader` and `config` for the device, 
to specify how the device will be loaded by the system and how it will be initially configured 
or authenticated. 

Mixin `@org.thingpedia.v2()` provides the most flexible loader module, which allows 
the user to supply additional JS package code to customized the configuration of the device 
and the behavior of each function. 
Other mixins for loader include `@org.thingpedia.rss` and `@org.thingpedia.generic_rest.v1`.
They give users the ability to write a device with standard RSS and RESTful interfaces without any JS code.
For more details, please refer to [declarative Thingpedia entries](/doc/thingpedia-device-with-zero-code.md). 

Mixin `@org.thingpedia.config.none` provides the basic config module for devices require no authentication
or those only require an API key.
More options such as OAuth and IoT discovery are described in
[complete guide for authentication and discovery](/doc/thingpedia-device-intro-auth-n-discovery.md).

## Function declarations
The user interacts with your Thingpedia device through two types of functions: queries and actions. 
Thus, the first step is to decide on what queries and actions you should expose.

The only requirement imposed from Thingpedia is that queries are free of side-effects and can return results (as output parameters),
and actions have side effects, and cannot return results. Other than that, the design of which functions to include is highly device specific.

### Qualifiers
Additional qualifier can be used to specify the property of the query. 
A query is `monitorable` if it's meaningful to monitor its return value and get triggered. 
A query is a `list` query if it normally returns multiple results. 

For example, a query to return latest emails would be considered both `monitorable` and `list`,
and its declaration will look like:
```tt
monitorable list latest_emails (...); 
```

For The Cat API, it returns a random cat every time, so it's not reasonable to monitor it. 
It also returns a single cat by default, so we also don't mark it as `list`.

### Parameters
To take full advantage of the functionality we provided in ThingTalk (filtering, chaining, etc.),  
every parameter needed for ___both input and output___ should be listed. 
An parameter is described as follows: 
```tt
[in req | in opt | out] <name> : <type>
```  

A parameter can be either `in req` (required input), `in opt` (optional input), or `out` (output).
The `type` of a parameter could be: String, Number, Boolean, Date, Time, Location, 
Entity(...), Enum(...), Measure(...), etc.
For the full list, see the [ThingTalk reference](/doc/thingtalk-reference.md)

For The Cat API, we have only a query to return random cat pictures. 
It takes an optional input parameter `count` of type Number, 
and 3 output parameters of type Entities: `image_id`, `picture_url`, and `link`.

### Annotations
Annotations are used to provide additional information to the corresponding code. 
Annotations always comes after the code and before the semicolon. 
There are two types of annotations: natural language annotation and implementation annotation.

#### Natural language annotation
Natural language annotation, as its name, is the annotation related to natural language 
and it will be translated to different languages based on users' profile. 
It's  denoted by `#_[<key>=<value>]`.

Here is a list of required natural language annotations for functions:
- `canonical`: The canonical form of the function name, used by the semantic parser (certain versions);
it's a good idea to omit stop words for this, and to use a longer expression. 
You must omit all arguments from the canonical form.
- `confirmation`: A string used to construct the final confirmation question before a rule is created
or an action is invoked. For actions, use the imperative form, e.g. “send a message”,
and for query use the noun-phrase form e.g. “cat pictures” instead of “get cat pictures”.
You can refer to required arguments with `$argname` or `${argname}` (the latter is only needed if
the argument is immediately followed by a letter number or underscore).
                  
#### Implementation annotation
Implementation annotation is used for describing the implementation details of a function. 
This is denoted by `#[<key>=<value>]` (without the underscore as in natural language annotation).               
   
Here is a list of required implementation annotations for functions:               
- `doc`: This is used for documentation for developers. 
- `poll_interval` (required for monitorable query): This is used to specify how often the query will be fired
if it is monitored. It takes a time interval, e.g., `#[poll_interval=5min]`.



