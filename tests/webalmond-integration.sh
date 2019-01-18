#!/bin/bash

## Integration tests for Web Almond against public Thingpedia
## (API, web pages)

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

DATABASE_URL="mysql://thingengine:thingengine@localhost/thingengine_test"
export DATABASE_URL

cat > $srcdir/secret_config.js <<'EOF'
module.exports.WITH_THINGPEDIA = 'external';
module.exports.THINGPEDIA_URL = 'https://almond-dev.stanford.edu/thingpedia';
module.exports.THINGENGINE_MANAGER_ADDRESS = ['./control1', './control2'];
module.exports.THINGENGINE_MANAGER_AUTHENTICATION = 'foo bar baz';
EOF

# clean the database and bootstrap
$srcdir/scripts/execute-sql-file.js $srcdir/model/schema.sql
eval $(node $srcdir/scripts/bootstrap.js)

workdir=`mktemp -t -d webalmond-integration-XXXXXX`
workdir=`realpath $workdir`
on_error() {
    test -n "$frontendpid" && kill $frontendpid || true
    frontendpid=
    test -n "$masterpid1" && kill $masterpid1 || true
    masterpid1=
    test -n "$masterpid2" && kill $masterpid2 || true
    masterpid2=
    wait

    # remove workdir after the processes have died, or they'll fail
    # to write to it
    rm -fr $workdir
}
trap on_error ERR INT TERM

oldpwd=`pwd`
cd $workdir

node $srcdir/tests/load_test_webalmond.js

# FIXME test with sandbox too...
export THINGENGINE_DISABLE_SANDBOX=1
node $srcdir/almond/master.js --shard 0 &
masterpid1=$!
node $srcdir/almond/master.js --shard 1 &
masterpid2=$!

node $srcdir/main.js &
frontendpid=$!

# in interactive mode, sleep forever
# the developer will run the tests by hand
# and Ctrl+C
if test "$1" = "--interactive" ; then
    sleep 84600
else
    # sleep until both processes are settled
    sleep 30

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
    node $srcdir/tests/test_website_basic.js

    # test the website in a browser
    SELENIUM_BROWSER=firefox node $srcdir/tests/test_website_selenium.js
fi

kill $frontendpid
frontendpid=
kill $masterpid1
masterpid1=
kill $masterpid2
masterpid2=
wait

rm -rf $workdir
