#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

REPO_ROOT="$(git rev-parse --show-toplevel)"
DEST_PATH="${REPO_ROOT}/tmp/kustomize.build.out.yaml"
OPEN_WITH="/usr/local/bin/code"

kustomize build "$@" > "${DEST_PATH}"
${OPEN_WITH} "${DEST_PATH}"
