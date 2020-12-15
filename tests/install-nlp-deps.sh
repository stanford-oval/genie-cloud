#!/bin/bash

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

pip install --user --upgrade pip
which genienlp >/dev/null 2>&1 || pip3 install --user 'git+https://github.com/stanford-oval/genienlp@3885917258678b8cd38fbd6d9b8488b6ac8caed7#egg=genienlp'
which genienlp

mkdir -p $srcdir/tests/embeddings
