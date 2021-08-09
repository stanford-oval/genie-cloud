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

# kill shared backend to generate coverage outputs
kubectl exec shared-backend-0 -- bash -c 'kill $(cat /home/almond-cloud/pid)'
sleep 2
kubectl exec shared-backend-0 -- bash -c "cd /opt/almond-cloud && npx nyc report"
kubectl exec shared-backend-0 -- bash -c "cd /opt/almond-cloud && npx nyc report --reporter=text-lcov" >> nyc_output

# kill developer backends to generate coverage outputs
BOB=`kubectl get pod -l app=user-6 -o jsonpath="{.items[0].metadata.name}"`
kubectl exec $BOB -- bash -c 'kill $(cat /home/almond-cloud/pid)'
sleep 2
kubectl exec $BOB -- bash -c "cd /opt/almond-cloud && npx nyc report"
kubectl exec $BOB -- bash -c "cd /opt/almond-cloud && npx nyc report --reporter=text-lcov" >> nyc_output

ROOT=`kubectl get pod -l app=user-1 -o jsonpath="{.items[0].metadata.name}"`
kubectl exec $ROOT -- bash -c 'kill $(cat /home/almond-cloud/pid)'
sleep 2
kubectl exec $ROOT -- bash -c "cd /opt/almond-cloud && npx nyc report"
kubectl exec $ROOT -- bash -c "cd /opt/almond-cloud && npx nyc report --reporter=text-lcov" >> nyc_output

# delete root should remove its backend deployment and service
test `kubectl get -l app=user-1 deployment -o jsonpath="{.items[*].metadata.name}"` = 'user-1'
test `kubectl get -l app=user-1 svc -o jsonpath="{.items[*].metadata.name}"` = 'user-1'
kubectl delete user user-1
sleep 2 
test -z `kubectl get -l app=user-1 deployment -o jsonpath="{.items[*].metadata.name}"`
test -z `kubectl get -l app=user-1 svc -o jsonpath="{.items[*].metadata.name}"`

# kill controler-manager to generate coverage outputs
MANAGER=`kubectl get pod -l control-plane=controller-manager -o jsonpath="{.items[0].metadata.name}"`
PID=`kubectl exec $MANAGER -c manager -- ps -ef | grep backend.test |  awk '{print $2}'`
kubectl exec $MANAGER -c manager -- kill -SIGINT $PID
sleep 1
kubectl exec $MANAGER -c manager -- cat /home/almond-cloud/coverage.out > coverage.out

# kill dbproxy to generate coverage outputs
DBPROXY=`kubectl get pod -l app=dbproxy -o jsonpath="{.items[0].metadata.name}"`
PID=`kubectl exec $DBPROXY -- ps -ef | grep backend.test |  awk '{print $2}'`
kubectl exec $DBPROXY -- kill -SIGINT $PID
sleep 1
kubectl exec $DBPROXY -- cat /home/almond-cloud/coverage.out >> coverage.out