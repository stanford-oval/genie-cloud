#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

REPO_ROOT="$(git rev-parse --show-toplevel)"
DEST_PATH="${REPO_ROOT}/k8s/config/dev/secret.yaml"

source "${REPO_ROOT}/dev/.env"

SECRET_KEY="$(openssl rand -hex 32)"
AES_SECRET_KEY="$(openssl rand -hex 16)"
JWT_SIGNING_KEY="$(openssl rand -hex 32)"

cat <<END >"${DEST_PATH}"
MAILGUN_USER: ${MAILGUN_SMTP_USERNAME}
MAILGUN_PASSWORD: ${MAILGUN_SMTP_PASSWORD}
EMAIL_TO_ADMIN: ${DEVELOPER_EMAIL}
SECRET_KEY: ${SECRET_KEY}
AES_SECRET_KEY: ${AES_SECRET_KEY}
JWT_SIGNING_KEY: ${JWT_SIGNING_KEY}
END
