#!/bin/bash

die() {
	echo "$@"
	exit 1
}

old_head=$1
test -n "$old_head" || die "Must pass the old commit head on the command line"

set -e
set -x
set -o pipefail

for migration in ./model/migrations/* ; do
	test -x $migration || continue
	commit=$(echo $migration | cut -f1 -d'-')

	if test -z "`git rev-list ${commit} ^${old_head}`" ; then
		echo "applying $migration"
	fi
done