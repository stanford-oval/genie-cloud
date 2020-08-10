#!/bin/bash

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

which genienlp >/dev/null 2>&1 || pip3 install --user 'git+https://github.com/stanford-oval/genienlp@5139c716558d59a4b05af9a2c27fa9569bf92d1d#egg=genienlp'
which genienlp

mkdir -p $srcdir/tests/embeddings
