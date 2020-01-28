#!/bin/bash

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

pip3 install --user -r nlp/python_classifier/requirements.txt

which decanlp >/dev/null 2>&1 || pip3 install --user 'git+https://github.com/stanford-oval/decaNLP.git@3f1aaaa1fb4e107952be0523e1c1d89093f4f48f#egg=decanlp'
which decanlp

mkdir -p $srcdir/tests/embeddings
cd $srcdir/tests/embeddings

wget -c --no-verbose https://oval.cs.stanford.edu/data/glove/thingtalk-lm2.pth

wget -c --no-verbose https://oval.cs.stanford.edu/data/glove/embeddings.tar.xz
tar xvf embeddings.tar.xz
