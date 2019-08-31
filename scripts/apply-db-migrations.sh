#!/bin/bash

die() {
	echo "$@"
	exit 1
}

dry_run=0
if test "$1" = "--dry-run" ; then
	dry_run=1
	shift
fi

old_head=$1
test -n "$old_head" || die "Must pass the old commit head on the command line"
old_head=`git rev-parse $old_head`

set -e
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

for migration in $srcdir/model/migrations/* ; do
	test -x $migration || continue
	commit=`basename $migration | cut -f1 -d'-'`
	commit=`git rev-parse $commit`

	if test -n "`git rev-list ${commit} ^${old_head}`" ; then
		echo "Applying `basename $migration`"
		if test $dry_run -eq 1 ; then
			continue
		fi

		case $migration in
		*.sql)
			$srcdir/scripts/execute-sql-file.js $migration
			;;
		*)
			$migration
			;;
		esac
	fi
done
