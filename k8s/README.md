# Almond Cloud Development Configuration

The configuration is divided in components, and each component has a "base"
directory shared by all environment, and an environment-specific directory.

## Components

- config: shared almond-cloud configuration files, and base k8s resources like namespace and service account
- controller: TODO
- mysql: MariaDB
- dbproxy: service that engine (?) nodes use to access the db
- frontend: almond-cloud frontend servers
- shared-backend: almond-cloud backend service

## Deployment Commands

(paths are relative to this directory)

```bash
kustomize build | kubectl apply -f -
```
