#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

REPO_ROOT="$(git rev-parse --show-toplevel)"

cd "${REPO_ROOT}/dev/k8s" && \
	kustomize build | kubectl --context docker-desktop apply -f -
