# Thingpedia API Reference

The Thingpedia API is accessible from
https://thingpedia.stanford.edu/thingpedia/api, and provides a way to query the
list of devices, the list of example sentences, and the configuration for each
device.

You can access the Thingpedia API from any endpoint, with no authentication.
Most APIs support the follow two optional parameters:

 * `locale`: locale code: language code - country code, eg. `en-US`
 * `developerKey`: developer key

## /thingpedia/api/schema/:type

Retrieve schema (type) information for a device type (such as `twitter` or `security-camera`).
Multiple types can specified, separated by a comma.

Parameters:

 * `version`: API version to use; currently __it must be 2__; if not passed it
   defaults to 1 for compatibility reasons

Returns:

An object whose keys are the requested device types. Each device type contains
`triggers`, `actions` and `queries`, each an object whose keys are the function
name and whose values are `types`: the list of argument types, `args`: the
list of argument names, and `requires`: a list of booleans that indicate if the
corresponding argument is required.

Example:

```
GET /thingpedia/api/schema/facebook,light-bulb?version=2

{
  "facebook": {
    "triggers": {},
    "actions": {
      "post": {
        "types": [
          "String"
        ],
        "args": [
          "status"
        ],
        "required": [
          false
        ]
      },
      "post_picture": {
        "types": [
          "Picture",
          "String"
        ],
        "args": [
          "picture_url",
          "caption"
        ],
        "required": [
          false,
          false
        ]
      }
    },
    "queries": {}
  },
  "light-bulb": {
    "triggers": {},
    "actions": {
      "alert_long": {
        "types": [],
        "args": [],
        "required": []
      },
      "color_loop": {
        "types": [],
        "args": [],
        "required": []
      },
      "set_power": {
        "types": [
          "Enum(on,off)"
        ],
        "args": [
          "power"
        ],
        "required": [
          false
        ]
      }
    },
    "queries": {}
  }
}
```
