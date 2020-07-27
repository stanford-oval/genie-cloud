#!/bin/bash

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

which genienlp >/dev/null 2>&1 || pip3 install --user 'git+https://github.com/stanford-oval/genienlp@8cbfe50e0e92b97e68dc013a3c48788df23c2f7a#egg=genienlp'
which genienlp

mkdir -p $srcdir/tests/embeddings
