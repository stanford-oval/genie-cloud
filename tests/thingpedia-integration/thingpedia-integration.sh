#!/bin/bash

## Integration tests for the embedded Thingpedia
## (API, web pages)

set -e
set -x
set -o pipefail

srcdir='/opt/almond-cloud'
workdir='/home/almond-cloud'
export THINGENGINE_ROOTDIR=$workdir

cd $workdir

# clean the database
mysql -h mariadb -u root -ppassword -e "drop database if exists thingengine_test;"
mysql -h mariadb -u root -ppassword -e "create database if not exists thingengine_test;"

# bootstrap
${srcdir}/dist/main.js bootstrap --force

# load some more data into Thingpedia
eval $(ts-node $srcdir/tests/load_test_thingpedia.ts)

# login as bob
bob_cookie=$(ts-node $srcdir/tests/login.js bob 12345678)

COOKIE="${bob_cookie}" ts-node $srcdir/tests/test_thingpedia_api_tt1.js
COOKIE="${bob_cookie}" ts-node $srcdir/tests/test_thingpedia_api_v3.js

# login as root
root_cookie=$(ts-node $srcdir/tests/login.js root rootroot)

# run the automated link checker
# first without login
ts-node $srcdir/tests/linkcheck.js
# then as bob (developer)
COOKIE="${bob_cookie}" ts-node $srcdir/tests/linkcheck.js
# then as root (admin)
COOKIE="${root_cookie}" ts-node $srcdir/tests/linkcheck.js

# test the website by making HTTP requests directly
ts-node $srcdir/tests/website

# test the website in a browser
# export PATH="/home/almond-cloud/geckodriver:$PATH"
# SELENIUM_BROWSER=firefox ts-node $srcdir/tests/test_website_selenium.js

# Now tests that we can update the datasets
mkdir -p $workdir/training/jobs/{1,2,3} $workdir/exact

# make up a training job
${srcdir}/dist/main.js execute-sql-file /proc/self/fd/0 <<<"insert into training_jobs set id = 1, job_type ='update-dataset', language = 'en', all_devices = 1, status = 'started', task_index = 0, task_name = 'update-dataset', config = '{}'"

# now update the exact match dataset (which will be saved to mysql and ./exact)
node ${srcdir}/dist/main.js run-training-task -t update-dataset --job-id 1 --job-dir $workdir/training/jobs/1 --debug
# download
node ${srcdir}/dist/main.js download-dataset -l en --output exact.tsv

# generate a training set

${srcdir}/dist/main.js execute-sql-file /proc/self/fd/0 <<<"insert into training_jobs set id = 2, job_type ='train', language = 'en', model_tag ='org.thingpedia.models.developer', all_devices = 1, status = 'started', task_index = 0, task_name = 'prepare-training-set', config = '{\"synthetic_depth\":3,\"dataset_target_pruning_size\":1000,\"dataset_eval_probability\":1.0}'"
node ${srcdir}/dist/main.js run-training-task -t prepare-training-set --job-id 2 --job-dir $workdir/training/jobs/2 --debug

set +o pipefail
shuf exact.tsv | head
shuf ./training/jobs/2/dataset/eval.tsv | head

sha256sum exact.tsv ./exact/en.btrie ./training/jobs/2/dataset/eval.tsv ./training/jobs/2/dataset/train.tsv
sha256sum -c <<EOF
6aae7594ad774e23634d88cb84197b43d8646722730087470d9c783b0b7eb675  exact.tsv
4f7326d833953aee245da096693d47f15399ac2cae6fab46953230fa12385faf  ./exact/en.btrie
6f16c60e07f0e61afbf1bdd9357ca77c248c3f3b51e8727a62a580f1257c4902  ./training/jobs/2/dataset/eval.tsv
a79e8f3e6487598a157e7a49f66950a4a78540a480ab76c68ddbadb6cb6e45dc  ./training/jobs/2/dataset/train.tsv
EOF
