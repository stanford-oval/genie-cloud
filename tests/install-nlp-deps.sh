#!/bin/bash

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

pip3 install -r nlp/python_classifier/requirements.txt

which decanlp >/dev/null 2>&1 || pip3 install --user 'git+https://github.com/stanford-oval/decaNLP.git#egg=decanlp'
which decanlp

mkdir -p $srcdir/tests/embeddings
cd $srcdir/tests/embeddings

wget -c --no-verbose https://oval.cs.stanford.edu/data/glove/thingtalk-lm2.pth

for v in charNgram glove.840B.300d ; do
	for f in vectors table itos ; do
		wget -c --no-verbose https://oval.cs.stanford.edu/data/glove/${v}.txt.${f}.npy
	done
done
