# Example Kubernetes configuration for Almond Cloud

This folder includes an example of a Kubernetes configuration
that can be used as a starting point (using a kustomization.yaml
file) or as a reference.

The files in this folder are an *example* only. Actually deploying Almond
Cloud requires site-specific configuration. Please refer to the
documentation for details.

## Installing the examples

For quick testing and development, it is possible to install the examples
in an existing Kubernetes cluster. **This is only tested in minikube, and not supported
in production.**

To install, use the following steps:

### Step 1: install the database

```bash
kubectl apply -f mysql.yaml
```

You can skip this step if you have a existing mysql installation in the cluster. In
that case, change the `DATABASE_URL` key in the configmap you'll choose in the next step.

### Step 2: configure

```
kubectl apply -f web-almond-config.yaml
```

This install Web Almond only, running against the public NLP and Thingpedia servers.
Other configurations might be added in the future.

### Step 3: bootstrap

```
kubectl apply -f bootstrap.yaml
```

This will run a job called `almond-bootstrap` that will bootstrap the Almond installation.
You should wait until the job completes before proceeding further.

### Step 4: run

```
kubectl apply -f backend.yaml -f frontend.yaml
```

## Available Kubernetes files

### mysql.yaml

A simple mysql deployment, lifted from the Kubernetes documentation. The root password is
`passwordpasswordpassword`. Needless to say, you should change that if the cluster is accessible
outside of a testing environment, or if the database will ever contain real data.

### web-almond-config.yaml

ConfigMap containing the configuration of Almond. This configuration enables Web Almond only,
running against the public NLP and Thingpedia servers.

The list of configuration keys is available at <https://almond.stanford.edu/doc/almond-config-file-reference.md>.

The configuration is provided as a configmap to simplify the examples, but because some
of the keys are security sensitive, it is likely better provided as a secret.

### backend.yaml

The file deploys an Almond backend, as a stateful set. Each replica of the stateful set
is assigned its own private storage (using a persistent volume claim) and runs a different
shard of users.

You cannot change the number of replicas after deployment. You should choose it ahead of time,
and adjust the `THINGENGINE_MANAGER_ADDRESS` key in the configuration accordingly.

Note that sandboxing is disabled in this example configuration. Sandboxing is not yet compatible
with running the backend in Kubernetes.

### frontend.yaml

The file deploys an Almond web frontend. The Almond frontend is a simple stateless server,
and it is accessible as the service "almond-frontend" forwarding port 8080.

The file also deploys an Ingress, with no host configured. On minikube, you should run
```bash
minikube addons enable ingress
```
to install an ingress controller and expose the frontend.

### nlp.yaml

This file deploys an NLP inference server, and configures a service "nlp" forwarding
port 8400. It also deploys a replicated tokenizer server, listening at the service
"tokenizer", port 8888.

The NLP server must be enabled and configured separately in the almond-config configmap.
Additionally, you will need to obtain a pretrained model, or obtain a dataset and
deploy a training service on a GPU-enabled machine.

### training.yaml

This file deploys a training controller server, with a corresponding service "training"
forwarding port 8090.

