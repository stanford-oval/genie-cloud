#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

context="$(kubectl config current-context)"
if echo "${context}" | grep -q 'research|serving|prod' ; then
   echo "ERROR not a local dev context: ${context}"
	 exit 1
fi

kubectl delete namespace almond-dev
