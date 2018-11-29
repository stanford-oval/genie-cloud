#!/bin/bash

set -e
set -x

for i in trainer commandpedia thingpedia-device-create thingpedia-portal ; do
	browserify -o public/javascripts/${i}-bundle.js browser/${i}.js
done