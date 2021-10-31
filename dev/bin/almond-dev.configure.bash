#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

REPO_ROOT="$(git rev-parse --show-toplevel)"
DEST_PATH="${REPO_ROOT}/k8s/config/dev/secret.yaml"

test -f "${REPO_ROOT}/dev/.env" && source "${REPO_ROOT}/dev/.env"

SECRET_PATH="${REPO_ROOT}/k8s/config/dev/secret.yaml"

SHARED_PATH="${REPO_ROOT}/tmp/shared"

for x in devices icons backgrounds blog-assets template-files/en; do
	mkdir -p "${SHARED_PATH}/download/$x"
done

SECRET_KEY="$(openssl rand -hex 32)"
AES_SECRET_KEY="$(openssl rand -hex 16)"
JWT_SIGNING_KEY="$(openssl rand -hex 32)"

cat <<END >"${SECRET_PATH}"
SECRET_KEY: ${SECRET_KEY}
AES_SECRET_KEY: ${AES_SECRET_KEY}
JWT_SIGNING_KEY: ${JWT_SIGNING_KEY}
END
