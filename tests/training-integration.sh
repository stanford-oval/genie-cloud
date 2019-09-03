#!/bin/bash

## Integration tests for the automatic training server

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

export THINGENGINE_USE_TOKENIZER=local
export GENIE_USE_TOKENIZER=local

PORT=${PORT:-8090}
cat > $srcdir/secret_config.js <<EOF
module.exports.DATABASE_URL="mysql://thingengine:thingengine@localhost/thingengine_test";
module.exports.SERVER_ORIGIN = 'http://127.0.0.1:8080';
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
module.exports.NL_SERVER_URL = null;
module.exports.NL_MODEL_DIR = null;
module.exports.TRAINING_URL = 'http://127.0.0.1:${PORT}';
module.exports.TRAINING_ACCESS_TOKEN = 'test-training-access-token';
module.exports.TRAINING_CONFIG_FILE = './training.conf.json';
module.exports.TRAINING_MEMORY_USAGE = 1000;
module.exports.SUPPORTED_LANGUAGES = ['en-US'];
EOF

workdir=`mktemp -t -d webalmond-integration-XXXXXX`
workdir=`realpath $workdir`
on_error() {
    test -n "$serverpid" && kill $serverpid
    serverpid=
    test -n "$frontendpid" && kill $frontendpid
    frontendpid=
    test -n "$tokenizerpid" && kill $tokenizerpid
    tokenizerpid=
    wait

    rm -fr $workdir
}
trap on_error ERR INT TERM

oldpwd=`pwd`
cd $workdir

node $srcdir/tests/mock-tokenizer.js &
tokenizerpid=$!

# add missing files to the workdir
cat > './training.conf.json' <<EOF
{
  "train_iterations": 10,
  "save_every": 2,
  "val_every": 2,
  "log_every": 2,
  "trainable_decoder_embedding": 10,
  "no_glove_decoder": true,
  "synthetic_depth": 2,
  "no_commit": true
}
EOF
node $srcdir/node_modules/.bin/genie compile-ppdb $srcdir/tests/data/ppdb-2.0-xs-lexical -o $workdir/ppdb-2.0-xs-lexical.bin
export PPDB=$workdir/ppdb-2.0-xs-lexical.bin

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
${srcdir}/main.js execute-sql-file $srcdir/model/schema.sql
${srcdir}/main.js bootstrap

# load some more data into Thingpedia
test -f $srcdir/tests/data/com.bing.zip || wget https://thingpedia.stanford.edu/thingpedia/download/devices/com.bing.zip -O $srcdir/tests/data/com.bing.zip
eval $(node $srcdir/tests/load_test_thingpedia.js)

${srcdir}/main.js run-frontend &
frontendpid=$!
${srcdir}/main.js run-training &
serverpid=$!

# in interactive mode, sleep forever
# the developer will run the tests by hand
# and Ctrl+C
if test "$1" = "--interactive" ; then
    sleep 84600
else
    # sleep until the process is settled
    sleep 30

    node $srcdir/tests/training
fi

kill $serverpid
serverpid=
kill $frontendpid
frontendpid=
kill $tokenizerpid
tokenizerpid=
wait


rm -rf $workdir
