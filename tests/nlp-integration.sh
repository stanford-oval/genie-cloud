#!/bin/bash

## Integration tests for the NLP components (training, inference)

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

export THINGENGINE_USE_TOKENIZER=local

NLP_PORT=${NLP_PORT:-8400}
TRAINING_PORT=${TRAINING_PORT:-8090}
cat > $srcdir/secret_config.js <<EOF
module.exports.NL_SERVER_URL = 'http://127.0.0.1:${NLP_PORT}';
module.exports.TRAINING_URL = 'http://127.0.0.1:${TRAINING_PORT}';
module.exports.FILE_STORAGE_BACKEND = 'local';
module.exports.CDN_HOST = '/download';
module.exports.WITH_THINGPEDIA = 'external';
module.exports.WITH_LUINET = 'embedded';
module.exports.THINGPEDIA_URL = 'https://almond-dev.stanford.edu/thingpedia';
module.exports.ENABLE_PROMETHEUS = true;
module.exports.PROMETHEUS_ACCESS_TOKEN = 'my-prometheus-access-token';
module.exports.DISCOURSE_SSO_SECRET = 'd836444a9e4084d5b224a60c208dce14';
EOF

workdir=`mktemp -t -d almond-nlp-integration-XXXXXX`
workdir=`realpath $workdir`
on_error() {
    test -n "$inferpid" && kill $inferpid
    inferpid=
    test -n "$tokenizerpid" && kill $tokenizerpid
    tokenizerpid=
    wait

    cd $oldpwd
    rm -fr $workdir
}
trap on_error ERR INT TERM

oldpwd=`pwd`
cd $workdir

node $srcdir/tests/mock-tokenizer.js &
tokenizerpid=$!

# set up download directories
mkdir -p $workdir/shared/download
for x in template-files/en ; do
    mkdir -p $workdir/shared/download/$x
done
mkdir -p $workdir/shared/cache
echo '{"tt:stock_id:goog": "fb80c6ac2685d4401806795765550abdce2aa906.png"}' > $workdir/shared/cache/index.json

# clean the database and bootstrap
${srcdir}/main.js execute-sql-file $srcdir/model/schema.sql
${srcdir}/main.js bootstrap

mkdir -p 'org.thingpedia.models.default:en'
mkdir -p 'org.thingpedia.models.contextual:en'

wget --no-verbose -c https://parmesan.stanford.edu/test-models/default/en/current.tar.gz -O $srcdir/tests/embeddings/current.tar.gz
tar xvf $srcdir/tests/embeddings/current.tar.gz -C 'org.thingpedia.models.default:en'

wget --no-verbose -c https://parmesan.stanford.edu/test-models/default/en/current-contextual.tar.gz -O $srcdir/tests/embeddings/current-contextual.tar.gz
tar xvf $srcdir/tests/embeddings/current-contextual.tar.gz -C 'org.thingpedia.models.contextual:en'

# remove developer models that were autoadded by bootstrap
# we'll test the main models only (there is no difference really)
${srcdir}/main.js execute-sql-file <(echo "delete from models where tag like '%developer%'")

mkdir -p 'classifier'
wget --no-verbose -c https://nnmaster.almond.stanford.edu/test-models/classifier1.tar.gz -O $srcdir/tests/embeddings/classifier1.tar.gz
tar xvf $srcdir/tests/embeddings/classifier1.tar.gz -C 'classifier'

PORT=$NLP_PORT node $srcdir/nlp/main.js &
inferpid=$!

# in interactive mode, sleep forever
# the developer will run the tests by hand
# and Ctrl+C
if test "$1" = "--interactive" ; then
    sleep 84600
else
    # sleep until the process is settled
    sleep 30

    node $srcdir/tests/nlp
fi

kill $inferpid
inferpid=
kill $tokenizerpid
tokenizerpid=
wait

cd $oldpwd
rm -fr $workdir
