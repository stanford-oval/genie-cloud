#!/bin/bash

## Integration tests for the embedded Thingpedia
## (API, web pages)

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

workdir=`mktemp -t -d webalmond-integration-XXXXXX`
workdir=`realpath $workdir`
on_error() {
    test -n "$frontendpid" && kill $frontendpid
    frontendpid=
    test -n "$masterpid" && kill $masterpid
    masterpid=
    wait

    rm -fr $workdir
}
trap on_error ERR INT TERM

oldpwd=`pwd`
cd $workdir
export THINGENGINE_ROOTDIR=$workdir

# remove stale config files
rm -f $srcdir/secret_config.js

mkdir -p $workdir/etc/config.d
export THINGENGINE_CONFIGDIR=$workdir/etc
PORT=${PORT:-8080}
cat > ${THINGENGINE_CONFIGDIR}/config.d/99-local.yaml <<EOF
DATABASE_URL: "mysql://thingengine:thingengine@localhost/thingengine"
SERVER_ORIGIN: "http://127.0.0.1:${PORT}"
FILE_STORAGE_BACKEND: local
CDN_HOST: /download
WITH_THINGPEDIA: embedded
WITH_LUINET: embedded
THINGPEDIA_URL: /thingpedia
DOCUMENTATION_URL: /doc/getting-started.md
ENABLE_DEVELOPER_PROGRAM: true
ENABLE_ANONYMOUS_USER: true
ENABLE_PROMETHEUS: true
PROMETHEUS_ACCESS_TOKEN: my-prometheus-access-token
DISCOURSE_SSO_SECRET: d836444a9e4084d5b224a60c208dce14
AES_SECRET_KEY: 80bb23f93126074ba01410c8a2278c0c
JWT_SIGNING_KEY: "not so secret key"
SECRET_KEY: "not so secret key"
NL_SERVER_URL: https://nlp-staging.almond.stanford.edu
SUPPORTED_LANGUAGES:
  - en-US
  - it-IT
  - zh-CN
  - zh-TW
EOF

# set up download directories
mkdir -p $workdir/shared/download
for x in devices icons backgrounds blog-assets template-files/en ; do
    mkdir -p $workdir/shared/download/$x
done
mkdir -p $workdir/shared/cache
echo '{"tt:stock_id:goog": "fb80c6ac2685d4401806795765550abdce2aa906.png"}' > $workdir/shared/cache/index.json

# clean the database and bootstrap
# (this has to occur after setting up the download
# directories because it copies the icon png files)
${srcdir}/main.js bootstrap --force

# load some more data into Thingpedia
test -f $srcdir/tests/data/com.bing.zip || wget https://thingpedia.stanford.edu/thingpedia/download/devices/com.bing.zip -O $srcdir/tests/data/com.bing.zip
eval $(node $srcdir/tests/load_test_thingpedia.js)

${srcdir}/main.js run-frontend &
frontendpid=$!

# in interactive mode, sleep forever
# the developer will run the tests by hand
# and Ctrl+C
if test "$1" = "--interactive" ; then
    sleep 84600
else
    # sleep until the process is settled
    sleep 30

    node $srcdir/tests/test_thingpedia_api_v1_v2.js

    # login as bob
    bob_cookie=$(node $srcdir/tests/login.js bob 12345678)

    COOKIE="${bob_cookie}" node $srcdir/tests/test_thingpedia_api_v3.js
fi

kill $frontendpid
frontendpid=
wait

# now enable the Stanford pages and run the website again
cp $srcdir/stanford/config.js $THINGENGINE_CONFIGDIR/config.d/00-stanford.js

# the website crawler tests will touch the web almond pages
# too, so make sure we don't die with 400 or 500 because Almond is off
# we have just tested operation without web almond anyway
export THINGENGINE_DISABLE_SYSTEMD=1
${srcdir}/main.js run-almond &
masterpid=$!

${srcdir}/main.js run-frontend &
frontendpid=$!

if test "$1" = "--webalmond-interactive" ; then
    sleep 84600
else
    # sleep until the process is settled
    sleep 30
    # run the website tests from web almond, this time with Thingpedia + Stanford
    # enabled

    # login as bob
    bob_cookie=$(node $srcdir/tests/login.js bob 12345678)
    # login as root
    root_cookie=$(node $srcdir/tests/login.js root rootroot)

    # run the automated link checker
    # first without login
    node $srcdir/tests/linkcheck.js
    # then as bob (developer)
    COOKIE="${bob_cookie}" node $srcdir/tests/linkcheck.js
    # then as root (admin)
    COOKIE="${root_cookie}" node $srcdir/tests/linkcheck.js

    # test the website by making HTTP requests directly
    node $srcdir/tests/website

    # test the website in a browser
    SELENIUM_BROWSER=firefox node $srcdir/tests/test_website_selenium.js
fi

kill $frontendpid
frontendpid=
kill $masterpid
masterpid=
wait

# Now tests that we can update the datasets

mkdir -p $workdir/training/jobs/{1,2,3}

# first compile the PPDB
node $srcdir/node_modules/.bin/genie compile-ppdb $srcdir/tests/data/ppdb-2.0-xs-lexical -o $workdir/ppdb-2.0-xs-lexical.bin
export PPDB=$workdir/ppdb-2.0-xs-lexical.bin

# make up a training job
${srcdir}/main.js execute-sql-file /proc/self/fd/0 <<<"insert into training_jobs set id = 1, job_type ='update-dataset', language = 'en', all_devices = 1, status = 'started', task_index = 0, task_name = 'update-dataset', config = '{}'"

# now update the exact match dataset (which will be saved to mysql)
node ${srcdir}/main.js run-training-task -t update-dataset --job-id 1 --job-dir $workdir/training/jobs/1 --debug
# download
node ${srcdir}/main.js download-dataset -l en --output exact.tsv

# generate a training set

${srcdir}/main.js execute-sql-file /proc/self/fd/0 <<<"insert into training_jobs set id = 2, job_type ='train', language = 'en', model_tag ='org.thingpedia.models.developer', all_devices = 1, status = 'started', task_index = 0, task_name = 'prepare-training-set', config = '{\"synthetic_depth\":3,\"dataset_target_pruning_size\":100000,\"dataset_eval_probability\":1.0}'"
node ${srcdir}/main.js run-training-task -t prepare-training-set --job-id 2 --job-dir $workdir/training/jobs/2 --debug

sha256sum exact.tsv ./training/jobs/2/dataset/eval.tsv ./training/jobs/2/dataset/train.tsv
sha256sum -c <<EOF
f1e73ee5de19f8aa92e5d8505bf6ed217b7c4135fb0a512bdbbfdd6d155582cd  exact.tsv
3ac80766f6627704c85572340a9cf034a9b0cdb9fe5ccce8e91f6af0829e5eb9  ./training/jobs/2/dataset/eval.tsv
2ce2576ca59b8cc1eeb35fdfa82dad89fff6bd9c2dffc39109cd830fb6ba4e95  ./training/jobs/2/dataset/train.tsv
EOF

rm -rf $workdir
