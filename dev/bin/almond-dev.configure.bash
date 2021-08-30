#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

REPO_ROOT="$(git rev-parse --show-toplevel)"
source "${REPO_ROOT}/dev/.env"

SECRET_PATH="${REPO_ROOT}/k8s/config/dev/secret.yaml"
BOOSTRAP_JOB_PATH="${REPO_ROOT}/k8s/bootstrap/dev/job.local.yaml"
FRONTEND_DEPLOYMENT_PATH="${REPO_ROOT}/k8s/frontend/dev/deployment.local.yaml"

SHARED_PATH="${REPO_ROOT}/tmp/shared"


for x in devices icons backgrounds blog-assets template-files/en; do
	mkdir -p "${SHARED_PATH}/download/$x"
done

SECRET_KEY="$(openssl rand -hex 32)"
AES_SECRET_KEY="$(openssl rand -hex 16)"
JWT_SIGNING_KEY="$(openssl rand -hex 32)"

cat <<END >"${SECRET_PATH}"
MAILGUN_USER: ${MAILGUN_SMTP_USERNAME}
MAILGUN_PASSWORD: ${MAILGUN_SMTP_PASSWORD}
EMAIL_TO_ADMIN: ${DEVELOPER_EMAIL}
SECRET_KEY: ${SECRET_KEY}
AES_SECRET_KEY: ${AES_SECRET_KEY}
JWT_SIGNING_KEY: ${JWT_SIGNING_KEY}
END

cat <<END >"${BOOSTRAP_JOB_PATH}"
apiVersion: batch/v1
kind: Job
metadata:
  name: bootstrap
spec:
  template:
    spec:
      volumes:
        - name: shared
          hostPath:
            path: ${SHARED_PATH}
END

cat <<END >"${FRONTEND_DEPLOYMENT_PATH}"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  template:
    spec:
      volumes:
        - name: src
          hostPath:
            path: ${REPO_ROOT}/src
        - name: views
          hostPath:
            path: ${REPO_ROOT}/views
        - name: shared
          hostPath:
            path: ${SHARED_PATH}
END
