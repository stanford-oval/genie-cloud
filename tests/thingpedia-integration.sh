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
    test -n "$dbproxypid" && kill $dbproxypid
    dbproxypid=
    wait

    rm -fr $workdir
    rm -f $srcdir/secret_config.js
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
cp ${srcdir}/stanford/config.js ${THINGENGINE_CONFIGDIR}/config.d/stanford.js
cat > ${THINGENGINE_CONFIGDIR}/config.d/99-local.yaml <<EOF
DATABASE_URL: "mysql://thingengine:thingengine@localhost/thingengine_test"
DATABASE_PROXY_URL: "http://127.0.0.1:8200"
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
${srcdir}/dist/main.js bootstrap --force

# load some more data into Thingpedia
test -f $srcdir/tests/data/com.bing.zip || wget https://thingpedia.stanford.edu/thingpedia/api/v3/devices/package/com.bing -O $srcdir/tests/data/com.bing.zip
eval $(ts-node $srcdir/tests/load_test_thingpedia.ts)

${srcdir}/go/backend/backend dbproxy &
dbproxypid=$!

${srcdir}/dist/main.js run-frontend &
frontendpid=$!

# in interactive mode, sleep forever
# the developer will run the tests by hand
# and Ctrl+C
if test "$1" = "--interactive" ; then
    sleep 84600
else
    # sleep until the process is settled
    sleep 30

    # login as bob
    bob_cookie=$(ts-node $srcdir/tests/login.js bob 12345678)

    COOKIE="${bob_cookie}" ts-node $srcdir/tests/test_thingpedia_api_tt1.js
    COOKIE="${bob_cookie}" ts-node $srcdir/tests/test_thingpedia_api_v3.js
fi

kill $frontendpid
frontendpid=

# now enable the Stanford pages and run the website again
cp $srcdir/stanford/config.js $THINGENGINE_CONFIGDIR/config.d/00-stanford.js

# the website crawler tests will touch the web almond pages
# too, so make sure we don't die with 400 or 500 because Almond is off
# we have just tested operation without web almond anyway
export THINGENGINE_DISABLE_SYSTEMD=1
${srcdir}/dist/main.js run-almond &
masterpid=$!

${srcdir}/dist/main.js run-frontend &
frontendpid=$!

if test "$1" = "--webalmond-interactive" ; then
    sleep 84600
else
    # sleep until the process is settled
    sleep 30
    # run the website tests from web almond, this time with Thingpedia + Stanford
    # enabled

    # login as bob
    bob_cookie=$(ts-node $srcdir/tests/login.js bob 12345678)
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
    SELENIUM_BROWSER=firefox ts-node $srcdir/tests/test_website_selenium.js
fi

kill $frontendpid
frontendpid=
kill $masterpid
masterpid=
kill $dbproxypid
dbproxypid=
wait

# Now tests that we can update the datasets

mkdir -p $workdir/training/jobs/{1,2,3} $workdir/exact

# make up a training job
${srcdir}/dist/main.js execute-sql-file /proc/self/fd/0 <<<"insert into training_jobs set id = 1, job_type ='update-dataset', language = 'en', all_devices = 1, status = 'started', task_index = 0, task_name = 'update-dataset', config = '{}'"

# now update the exact match dataset (which will be saved to mysql and ./exact)
node ${srcdir}/dist/main.js run-training-task -t update-dataset --job-id 1 --job-dir $workdir/training/jobs/1 --debug
# download
node ${srcdir}/dist/main.js download-dataset -l en --output exact.tsv

set +o pipefail
shuf exact.tsv | head

sha256sum exact.tsv ./exact/en.btrie
sha256sum -c <<EOF
4d71ea7f99eb373dc4978aeca3a4c72ddbaa707a0c447dec8922387c59a23bad  exact.tsv
1f9312aab346181ce38fa7ce0a79288bd2692545517fec78a31772e354c5ed2e  ./exact/en.btrie
EOF

rm -rf $workdir
rm -f $srcdir/secret_config.js
