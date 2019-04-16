#!/bin/bash

set -e
srcdir=`dirname $0`

if test "$TRAVIS_REPO_SLUG" != "stanford-oval/almond-cloud" ; then
	exit 0
fi
if test "$TRAVIS_PULL_REQUEST" != "false" ; then
	exit 0
fi

echo "Unlocking Travis autodeploy key..."
openssl aes-256-cbc \
	-K $encrypted_6dd165f04fd2_key -iv $encrypted_6dd165f04fd2_iv \
	-in $srcdir/id_rsa.autodeploy.enc \
	-out $srcdir/id_rsa.autodeploy \
	-d
chmod 0600 $srcdir/id_rsa.autodeploy
