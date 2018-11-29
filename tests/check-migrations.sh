#!/bin/bash

set -e
set -o pipefail

srcdir=`dirname $0`/..
srcdir=`realpath $srcdir`

for migration in $srcdir/model/migrations/* ; do
	if ! test -x $migration ; then
		case `basename $migration` in
		*.sql|*.sh|*.js)
			echo "Found migration file $migration that is not executable"
			exit 1
			;;
		*)
			continue
			;;
		esac
	fi
	commit=`basename $migration | cut -f1 -d'-'`
	git rev-parse --verify "$commit^{commit}"
done