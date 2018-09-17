#!/bin/sh

set -e
set -x

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

DATABASE_URL="mysql://thingengine:thingengine@localhost/thingengine_test"

mysql -u thingengine -pthingengine -h localhost -D thingengine_test < $srcdir/model/schema.sql
node $srcdir/scripts/bootstrap.js