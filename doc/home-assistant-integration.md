# Integrating with Home Assistant


[Home Assistant](https://home-assistant.io) is one of the leading open-source IoT gateway solutions, and it allows to
you to integrate and control devices of more than 1,400 different brands. Almond provides
first class integration for Home Assistant.

[[toc]]

## Configuring Home Assistant

Almond is compatible with Home Assistant installed using [Hass.io](https://hass.io), which
uses the URL `hassio.local`. If that is the case, you can configure Home Assistant
like any other Thingpedia device, by saying "configure home assistant".

After configuration, any compatible device that is configured in Home Assistant will also
be available in Almond, and you will be able to use Home Assistant devices from natural
language.

Because Home Assistant uses a local connection, you cannot use it from Web Almond.

## Extending Home Assistant

The code for the Home Assistant integration in Almond lives in
[thingpedia-common-devices](https://github.com/stanford-oval/thingpedia-common-devices),
under the `io.home-assistant` package.

The Home Assistant Thingpedia interface (`@io.home-assistant`) is a gateway device:
it connects to the gateway, and exposes all configured Home Assistant entities as some
corresponding Thingpedia device (usually, a generic one).

### Adding Home Assistant support for an existing Thingpedia interface

If you want to have Home Assistant support for an interface that is already in Thingpedia
for a different brand (for example, the `@security-camera` interface), you should create
a new module in the `io.home-assistant` folder.

The module should export a class that inherits from the base Home Assistant device defined
in `./base.js` (and **not** the `Tp.BaseDevice` that Thingpedia devices normally inherit from).
Inside the class, you can query the Home Assistant entity state as `this.state.state`, and
query the Home Assistant entity attributes as `this.state.attributes`. To implement actions,
you can call Home Assistant services with `this._callService`. Please look at `light.js` for
an example.

When done, you must modify `index.js` to refer to your device as follows:
```
const DOMAIN_TO_TP_KIND = {
    <Home Assistant domain>: <Thingpedia interface ID (e.g. "security-camera")> 
};
const SUBDEVICES = {
    <Thingpedia interface ID>: <your device class>
};
```
You must also add the newly supported Thingpedia interface in the `#[child_types]` annotation
in the manifest.tt file.

### Adding a new Thingpedia interface backed by Home Assistant

If you want to support a type of device that is not in Thingpedia already, you should also
create an abstract Thingpedia class. For example, to support an imaginary Frombulator device, you should
create an abstract Thingpedia class like:

```
abstract class @<your-username>.frombulator {
   query state(out state : Enum(active,inactive));
   
   action frombulate();
}
```

Add natural language support for the new interface as customary from the `dataset.tt` file.
Then, add Home Assistant support for the new interface following the previous guide.

By convention, general device interfaces use either a single-part name (`@light-bulb`, `@security-camera`),
or a name in the `@org.thingpedia` namespace. Only administrators can upload a device with this name though. 
You should use your own username as prefix (as it is your private namespace), and the name will
be adjusted during review.

### Testing & Contributing your changes

To test your changes, follow the [Thingpedia Testing Guide](thingpedia-testing.md). If you want
to upload to Thingpedia for testing, you should modify the name and ID of the Home Assistant gateway,
and upload a copy.

Once done with the development, you should open a PR against the
[thingpedia-common-devices](https://github.com/stanford-oval/thingpedia-common-devices) so your
changes can be reviewed and merged.
