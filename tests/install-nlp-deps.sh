#!/bin/bash

set -e
set -x
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

which genienlp >/dev/null 2>&1 || pip3 install --user 'git+https://github.com/stanford-oval/genienlp@74915155fa683fed4345674c3e4d7df79cc98580#egg=genienlp'
which genienlp

mkdir -p $srcdir/tests/embeddings
