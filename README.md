# ThingEngine

## Help the World Connect the Dots

ThingEngine is the workhorse behind ThingPedia, the open source platform for IoT rules
that you can execute anywhere you want.

ThingEngine comes in three form:

- As a phone app, for Android
- As an installable app for a home server
- As a web service hosted at <https://thingengine.stanford.edu>

This module contains the web service version of ThingEngine, and
depends on a number of other modules.

Additionally the system is able to synchronize the three installations that belong
to the same user, so that each app can run on the form most suited to it, in a manner
completely transparent to the developer, while preserving the privacy of the user.

ThingEngine is based on node.js. It uses jxcore to provide Android integration
and express as the web frontend.
And it's free software, released under the GPLv2 or later, to help build
a community of developers and users around it.

ThingEngine is part of ThingPedia, a research project led by prof. Monica Lam, from Stanford University.
You can find more information at <http://thingengine.stanford.edu/about>, and you
can find user documentation [here](/doc/main.md)
