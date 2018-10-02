#!/bin/bash

set -e
set -x

for i in trainer new-command thingpedia-device-create ; do
	browserify -o public/javascripts/${i}-bundle.js browser/${i}.js
done