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
module.exports.THINGPEDIA_URL = 'https://thingpedia.stanford.edu/thingpedia';
EOF

# clean the database and bootstrap
mysql -u thingengine -pthingengine -h localhost -D thingengine_test < $srcdir/model/schema.sql
eval $(node $srcdir/scripts/bootstrap.js)

workdir=`mktemp -t -d webalmond-integration-XXXXXX`
workdir=`realpath $workdir`
on_error() {
    rm -fr $workdir
    test -n "$frontendpid" && kill $frontendpid
    frontendpid=
    test -n "$masterpid" && kill $masterpid
    masterpid=
    wait
}
trap on_error ERR INT TERM

oldpwd=`pwd`
cd $workdir

# FIXME test with sandbox too...
export THINGENGINE_DISABLE_SANDBOX=1
node $srcdir/almond/master.js &
masterpid=$!

node $srcdir/main.js &
frontendpid=$!

# sleep until both processes are settled
sleep 30

# TODO run tests here

# sample test: the word Almond appears somewhere on the front page
# (real tests should use Selenium probably)
curl -f 'http://127.0.0.1:8080/' | grep -q "Almond"

kill $frontendpid
frontendpid=
kill $masterpid
masterpid=
wait

rm -rf $workdir
