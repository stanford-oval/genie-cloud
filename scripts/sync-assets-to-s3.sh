#!/bin/bash

die() {
	echo "$@"
	exit 1
}

set -e
set -x

s3_bucket=$1
test -n "$s3_bucket" || die "Usage: $0 S3_BUCKET"

srcdir=`dirname "$0"`/..
srcdir=`realpath "$srcdir"`

for folder in fonts images javascripts stylesheets ; do
	aws s3 sync "${srcdir}/public/${folder}" "s3://${s3_bucket}/assets/${folder}"
done