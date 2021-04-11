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
AES_SECRET_KEY=80bb23f93126074ba01410c8a2278c0c
export AES_SECRET_KEY
JWT_SIGNING_KEY="not so secret key"
export JWT_SIGNING_KEY
SECRET_KEY="not so secret key"
export SECRET_KEY

# note: the discourse_sso_secret SHOULD NEVER be in plain text in secret_config.js
# this is just for ease of testing
# this secret is the one used by the discourse tutorial, which simplifies testing
cat > $srcdir/secret_config.js <<'EOF'
module.exports.SERVER_ORIGIN = 'http://127.0.0.1:7070';
module.exports.WITH_THINGPEDIA = 'external';
module.exports.THINGPEDIA_URL = 'https://dev.almond.stanford.edu/thingpedia';
module.exports.NL_SERVER_URL = 'https://nlp-staging.almond.stanford.edu';
module.exports.THINGENGINE_MANAGER_ADDRESS = ['./control1', './control2'];
module.exports.THINGENGINE_MANAGER_AUTHENTICATION = 'foo bar baz';
module.exports.DISCOURSE_SSO_SECRET = 'd836444a9e4084d5b224a60c208dce14';
module.exports.DISCOURSE_SSO_REDIRECT = 'https://discourse.almond.stanford.edu';
module.exports.ENABLE_ANONYMOUS_USER = true;
EOF

# clean the database and bootstrap
${srcdir}/dist/main.js bootstrap --force

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
    rm -f $srcdir/secret_config.js
}
trap on_error ERR INT TERM

oldpwd=`pwd`
cd $workdir

# set up download directories
mkdir -p $workdir/shared/download
for x in blog-assets ; do
    mkdir -p $workdir/shared/download/$x
done

ts-node $srcdir/tests/load_test_webalmond.js

export THINGENGINE_DISABLE_SANDBOX=1
${srcdir}/dist/main.js run-almond --shard 0 &
masterpid1=$!
${srcdir}/dist/main.js run-almond --shard 1 &
masterpid2=$!

${srcdir}/dist/main.js run-frontend --port 7070 &
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
kill $masterpid1
masterpid1=
kill $masterpid2
masterpid2=
wait

rm -rf $workdir
rm -f $srcdir/secret_config.js
