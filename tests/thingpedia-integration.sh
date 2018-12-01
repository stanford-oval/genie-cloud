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
module.exports.FILE_STORAGE_BACKEND = 'local';
module.exports.CDN_HOST = '/download';
module.exports.WITH_THINGPEDIA = 'embedded';
module.exports.THINGPEDIA_URL = '/thingpedia';
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
for x in devices icons backgrounds ; do
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

node $srcdir/main.js &
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
    node $srcdir/tests/test_thingpedia_api_v3.js
fi

kill $frontendpid
frontendpid=
wait

# now enable the Stanford pages and run the website again
echo "Object.assign(module.exports, require('./stanford/config.js'));" >> $srcdir/secret_config.js

# the website crawler tests will touch the web almond pages
# too, so make sure we don't die with 400 or 500 because Almond is off
# we have just tested operation without web almond anyway
export THINGENGINE_DISABLE_SANDBOX=1
node $srcdir/almond/master.js &
masterpid=$!

node $srcdir/main.js &
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
    node $srcdir/tests/test_website_basic.js

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
node $srcdir/scripts/generate_binary_ppdb.js $srcdir/tests/data/ppdb-2.0-xs-lexical $workdir/ppdb-2.0-xs-lexical.bin

# now generate the dataset (which will be saved to mysql)
node $srcdir/training/update-dataset.js -l en -a --maxdepth 3 --ppdb $workdir/ppdb-2.0-xs-lexical.bin

# download and check
node $srcdir/training/download-dataset.js -l en --no-quote-free --train train-quoted.tsv --eval eval-quoted.tsv
node $srcdir/training/download-dataset.js -l en --quote-free --train train-quote-free.tsv --eval eval-quote-free.tsv

sha256sum train-quoted.tsv eval-quoted.tsv train-quote-free.tsv eval-quote-free.tsv
sha256sum -c <<EOF
c5a319bef9a02f2cd873ba1757191a1e015be0b0df411e76628652b8753b41f4  train-quoted.tsv
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  eval-quoted.tsv
cde7ee8737a72076343d04196e12362d74349c041f19e438c825961981c2cdd7  train-quote-free.tsv
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  eval-quote-free.tsv
EOF

# now regenerate the dataset incrementally
node $srcdir/training/update-dataset.js -l en --device com.bing --maxdepth 3 --ppdb $workdir/ppdb-2.0-xs-lexical.bin

rm -rf $workdir
