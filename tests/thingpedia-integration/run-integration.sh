#!/bin/bash
set -ex
srcdir=`dirname $0`/../..
srcdir=`realpath $srcdir`
cd $srcdir 

# Run thingpedia-integration test inside frontend pod
POD=`kubectl get pod -l app=frontend -o jsonpath="{.items[0].metadata.name}"`
kubectl exec $POD --  bash -c "cd /opt/almond-cloud && npx nyc tests/thingpedia-integration/thingpedia-integration.sh"

# Run selenium test on ubuntu with Firefox installed
THINGENGINE_CONFIGDIR=tests/thingpedia-integration/k8s npx nyc ts-node tests/test_website_selenium.js

# Copy coverage outputs from frontend pod
kubectl cp $POD:/opt/almond-cloud/.nyc_output .nyc_output
