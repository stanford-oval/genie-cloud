#!/bin/bash

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

which decanlp >/dev/null 2>&1 || pip3 install --user -r $srcdir/tests/decanlp-deps.txt
which decanlp

mkdir -p $srcdir/tests/embeddings
cd $srcdir/tests/embeddings

wget -c --no-verbose https://oval.cs.stanford.edu/data/glove/glove.840B.300d.txt.pt
wget -c --no-verbose https://oval.cs.stanford.edu/data/glove/charNgram.txt.pt
