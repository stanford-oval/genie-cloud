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

if which kind 1>/dev/null 2>&1 ; then
  # inside kind, the true host directory is mounted to /host in the kind node container
  # (which is the host for the k8s pods)
  CLUSTER_REPO_ROOT=/host
else
  CLUSTER_REPO_ROOT="${REPO_ROOT}"
fi

SECRET_PATH="${REPO_ROOT}/k8s/config/dev/secret.yaml"
BOOSTRAP_JOB_PATH="${REPO_ROOT}/k8s/bootstrap/dev/job.local.yaml"
FRONTEND_DEPLOYMENT_PATH="${REPO_ROOT}/k8s/frontend/dev/deployment.local.yaml"
BACKEND_DEPLOYMENT_PATH="${REPO_ROOT}/k8s/shared-backend/dev/stateful-set.local.yaml"

SHARED_PATH="${REPO_ROOT}/tmp/shared"
CLUSTER_SHARED_PATH="${CLUSTER_REPO_ROOT}/tmp/shared"

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

cat <<END >"${BOOSTRAP_JOB_PATH}"
---
apiVersion: batch/v1
kind: Job
metadata:
  name: bootstrap
spec:
  template:
    spec:
      volumes:
        - name: src
          hostPath:
            path: ${CLUSTER_REPO_ROOT}/src
        - name: shared
          hostPath:
            path: ${CLUSTER_REPO_ROOT}/tmp/shared
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
            path: ${CLUSTER_REPO_ROOT}/src
        - name: views
          hostPath:
            path: ${CLUSTER_REPO_ROOT}/views
        - name: shared
          hostPath:
            path: ${CLUSTER_REPO_ROOT}/tmp/shared
END

cat <<END >"${BACKEND_DEPLOYMENT_PATH}"
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: shared-backend
spec:
  template:
    spec:
      volumes:
        - name: src
          hostPath:
            path: ${CLUSTER_REPO_ROOT}/src
END
