#!/bin/sh

set -e
set -x

srcdir=`dirname $0`/..

# unit tests
node $srcdir/tests/unit

# integration tests
# (these spawn the whole system, with all the bells and whistles,
# and fire requests at it, checking the result)

$srcdir/tests/webalmond-integration.sh
$srcdir/tests/thingpedia-integration.sh
