#!/bin/bash

## Integration tests for the embedded Thingpedia
## (API, web pages)

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

PORT=${PORT:-8080}
cat > $srcdir/secret_config.js <<EOF
module.exports.DATABASE_URL="mysql://thingengine:thingengine@localhost/thingengine_test";
module.exports.SERVER_ORIGIN = 'http://127.0.0.1:${PORT}';
module.exports.FILE_STORAGE_BACKEND = 'local';
module.exports.CDN_HOST = '/download';
module.exports.WITH_THINGPEDIA = 'embedded';
module.exports.WITH_LUINET = 'embedded';
module.exports.THINGPEDIA_URL = '/thingpedia';
module.exports.DOCUMENTATION_URL = '/doc/getting-started.md';
module.exports.ENABLE_DEVELOPER_PROGRAM = true;
module.exports.ENABLE_PROMETHEUS = true;
module.exports.PROMETHEUS_ACCESS_TOKEN = 'my-prometheus-access-token';
module.exports.DISCOURSE_SSO_SECRET = 'd836444a9e4084d5b224a60c208dce14';
module.exports.AES_SECRET_KEY = '80bb23f93126074ba01410c8a2278c0c';
module.exports.JWT_SIGNING_KEY = "not so secret key" ;
module.exports.SECRET_KEY = "not so secret key";
module.exports.NL_SERVER_URL = "https://almond-dev.stanford.edu/nnparser";
module.exports.SUPPORTED_LANGUAGES = ['en-US', 'it-IT', 'zh-CN', 'zh-TW'];
EOF

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

# set up download directories
mkdir -p $srcdir/public/download
for x in devices icons backgrounds blog-assets template-files ; do
    mkdir -p $workdir/shared/$x
    ln -sf -T $workdir/shared/$x $srcdir/public/download/$x
done
mkdir -p $workdir/shared/cache
echo '{"tt:stock_id:goog": "fb80c6ac2685d4401806795765550abdce2aa906.png"}' > $workdir/shared/cache/index.json

# clean the database and bootstrap
# (this has to occur after setting up the download
# directories because it copies the icon png files)
$srcdir/scripts/execute-sql-file.js $srcdir/model/schema.sql
node $srcdir/scripts/bootstrap.js

# load some more data into Thingpedia
test -f $srcdir/tests/data/com.bing.zip || wget https://thingpedia.stanford.edu/thingpedia/download/devices/com.bing.zip -O $srcdir/tests/data/com.bing.zip
eval $(node $srcdir/tests/load_test_thingpedia.js)

node $srcdir/frontend.js &
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
cat > $srcdir/secret_config.js <<EOF
Object.assign(module.exports, require('./stanford/config.js'));
module.exports.DATABASE_URL="mysql://thingengine:thingengine@localhost/thingengine_test";
module.exports.SERVER_ORIGIN = 'http://127.0.0.1:${PORT}';
module.exports.OAUTH_REDIRECT_ORIGIN = module.exports.SERVER_ORIGIN;
module.exports.FILE_STORAGE_BACKEND = 'local';
module.exports.CDN_HOST = '/download';
module.exports.WITH_THINGPEDIA = 'embedded';
module.exports.WITH_LUINET = 'embedded';
module.exports.THINGPEDIA_URL = '/thingpedia';
module.exports.DOCUMENTATION_URL = '/doc/getting-started.md';
module.exports.ENABLE_DEVELOPER_PROGRAM = true;
module.exports.ENABLE_PROMETHEUS = true;
module.exports.PROMETHEUS_ACCESS_TOKEN = 'my-prometheus-access-token';
module.exports.DISCOURSE_SSO_SECRET = 'd836444a9e4084d5b224a60c208dce14';
module.exports.AES_SECRET_KEY = '80bb23f93126074ba01410c8a2278c0c';
module.exports.JWT_SIGNING_KEY = "not so secret key" ;
module.exports.SECRET_KEY = "not so secret key";
module.exports.NL_SERVER_URL = "https://almond-dev.stanford.edu/nnparser";
module.exports.SUPPORTED_LANGUAGES = ['en-US', 'it-IT', 'zh-CN', 'zh-TW'];
EOF

# the website crawler tests will touch the web almond pages
# too, so make sure we don't die with 400 or 500 because Almond is off
# we have just tested operation without web almond anyway
export THINGENGINE_DISABLE_SYSTEMD=1
node $srcdir/almond/master.js &
masterpid=$!

node $srcdir/frontend.js &
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

# first compile the PPDB
node $srcdir/node_modules/.bin/genie compile-ppdb $srcdir/tests/data/ppdb-2.0-xs-lexical -o $workdir/ppdb-2.0-xs-lexical.bin

# now update the exact match dataset (which will be saved to mysql)
node $srcdir/training/update-dataset.js -l en --maxdepth 3 --debug
# download
node $srcdir/training/download-dataset.js -l en --output exact.tsv

# generate a training set
mkdir jobdir
(cd jobdir; THINGENGINE_ROOTDIR=.. node $srcdir/training/prepare-training-set.js -l en \
    --owner 1 --template-file org.thingpedia.genie.thingtalk \
    --flag policies --flag remote_programs --flag aggregation --flag bookkeeping --flag triple_commands --flag configure_actions \
    --maxdepth 3 --train train.tsv --eval eval.tsv --eval-probability 1.0 \
    --ppdb $workdir/ppdb-2.0-xs-lexical.bin )

sha256sum exact.tsv jobdir/eval.tsv jobdir/train.tsv
sha256sum -c <<EOF
4295b60b193c673ea168844e441794cbf638e094abe2be3675e5024066f55d15  exact.tsv
72bccb2f8b7d4c6b6556eb5c998374c0b10b1e78c56f3ba7f72ea08cd5a8f240  jobdir/eval.tsv
baecee6a1b4b67dccc007d8fffd20954274524b16ce363ca14c9df9af83b3c6f  jobdir/train.tsv
EOF

# now update the exact match dataset incrementally
node $srcdir/training/update-dataset.js -l en --device com.bing --maxdepth 3 --debug

rm -rf $workdir
