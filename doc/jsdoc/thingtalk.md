The ThingTalk library contains the AST definitions, the type system and compiler
for the ThingTalk library.

You will need this library if:
- you want to extend Almond to support new constructs (available across all devices),
- you're writing Genie construct templates, or translating Genie templates to a new language
- you're using the Almond engine or dialog agent

This library can also be used from Thingpedia devices, if you require `thingtalk`, provided
you note the versioning policy (below). You **must not** bundle your own copy of the ThingTalk library.
If you do so, things are likely to break with obscure errors such as "Invalid type for parameter foo: expected String, got String".
In fact, Almond integrators and engine builders must also ensure only one copy of 
the ThingTalk library is used at any time.

## Versioning

This package **does not** follow semantic versioning. Instead, the version should
be interpreted as:

- Major version will be bumped for incompatible changes in the language, such that
  existing valid programs are no longer valid
- Minor version will be bumped for any change in the library, such as AST definitions,
  interfaces to compilation/optimization passes, adding and removing additional processing
  modules
- Patch version will be bumped for compatible bug fixes

**Minor version bumps can introduce incompatibility to library users**; it is
recommended that library users use tilde version ranges on their ThingTalk dependency,
or use a service such as [Greenkeeper](https://greenkeeper.io) to check for incompatibilities.
