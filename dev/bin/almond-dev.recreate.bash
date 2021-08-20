#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

cd "$(git rev-parse --show-toplevel)/dev/bin" && \
	./almond-dev.destroy.bash &&
	./almond-dev.create.bash
