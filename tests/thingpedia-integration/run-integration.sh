#!/bin/bash
set -ex
srcdir=`dirname $0`/../..
srcdir=`realpath $srcdir`
cd $srcdir 

# Run thingpedia-integration test inside frontend pod
FRONTEND=`kubectl get pod -l app=frontend -o jsonpath="{.items[0].metadata.name}"`
kubectl exec $FRONTEND --  bash -c "cd /opt/almond-cloud && npx nyc tests/thingpedia-integration/thingpedia-integration.sh"

# Run selenium test on ubuntu with Firefox installed
THINGENGINE_CONFIGDIR=tests/thingpedia-integration/k8s npx nyc ts-node tests/test_website_selenium.js

# Get local nyc output
npx nyc report
npx nyc report --reporter=text-lcov > nyc_output

# kill frontend to generate coverage outputs
kubectl exec $FRONTEND -- bash -c 'kill $(cat /home/almond-cloud/pid)'
sleep 2
kubectl exec $FRONTEND -- bash -c "cd /opt/almond-cloud && npx nyc report"
kubectl exec $FRONTEND -- bash -c "cd /opt/almond-cloud && npx nyc report --reporter=text-lcov" >> nyc_output

# kill backend to generate coverage outputs
kubectl exec shared-backend-0 -- bash -c 'kill $(cat /home/almond-cloud/pid)'
sleep 2
kubectl exec shared-backend-0 -- bash -c "cd /opt/almond-cloud && npx nyc report"
kubectl exec shared-backend-0 -- bash -c "cd /opt/almond-cloud && npx nyc report --reporter=text-lcov" >> nyc_output
