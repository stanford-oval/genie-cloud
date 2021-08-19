#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

cd "$(git rev-parse --show-toplevel)/dev/k8s" && \
	kubectl --context docker-desktop delete namespace almond-dev
