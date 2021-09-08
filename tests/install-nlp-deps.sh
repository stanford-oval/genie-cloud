#!/bin/bash

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

pip install --user --upgrade pip
which genienlp >/dev/null 2>&1 || pip3 install --user genienlp==0.7.0a2
which genienlp

mkdir -p $srcdir/tests/embeddings
