#!/bin/bash

## Integration tests for the embedded Thingpedia
## (API, web pages)

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

DATABASE_URL="mysql://thingengine:thingengine@localhost/thingengine_test"
export DATABASE_URL

cat > $srcdir/secret_config.js <<'EOF'
module.exports.S3_CLOUDFRONT_HOST = '/download';
module.exports.WITH_THINGPEDIA = 'embedded';
module.exports.THINGPEDIA_URL = '/thingpedia';
EOF

# clean the database and bootstrap
mysql -u thingengine -pthingengine -h localhost -D thingengine_test < $srcdir/model/schema.sql
node $srcdir/scripts/bootstrap.js

workdir=`mktemp -t -d webalmond-integration-XXXXXX`
workdir=`realpath $workdir`
on_error() {
    rm -fr $workdir
    test -n "$frontendpid" && kill $frontendpid
    frontendpid=
    wait
}
trap on_error ERR INT TERM

oldpwd=`pwd`
cd $workdir

# set up download directories
mkdir -p $srcdir/public/download
for x in devices icons backgrounds ; do
    mkdir -p $workdir/shared/$x
    ln -sf -T $workdir/shared/$x $srcdir/public/download/$x
done

# load some more data into Thingpedia
# (this has to occur after setting up the download
# directories because it copies the zip file)
test -f $srcdir/tests/data/com.bing.zip || wget https://thingpedia.stanford.edu/thingpedia/download/devices/com.bing.zip -O $srcdir/tests/data/com.bing.zip
node $srcdir/tests/load_test_thingpedia.js

node $srcdir/main.js &
frontendpid=$!

# sleep until the process is settled
sleep 30

# if the developer says --sleep on the command line, just
# sleep forever
# this allows the developer (aka, me) to fire a browser,
# login and check wtf is going on
test "$1" == "--sleep" && sleep 1d

node $srcdir/tests/test_thingpedia_api_v1_v2.js
#node $srcdir/tests/test_thingpedia_api_v3.js

kill $frontendpid
frontendpid=
wait

rm -rf $workdir
