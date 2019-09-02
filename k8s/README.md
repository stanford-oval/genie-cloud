# Example Kubernetes configuration for Almond Cloud

This folder includes an example of a Kubernetes configuration
that can be used as a starting point (using a kustomization.yaml
file) or as a reference.

The files in this folder are an *example* only. Actually deploying Almond
Cloud requires site-specific configuration. Please refer to the
documentation for details.

## nlp.yaml

This file deploys an NLP inference server, and configures a service "nlp" forwarding
port 8400. It also deploys a replicated tokenizer server, listening at the service
"tokenizer", port 8888.
The NLP server must be configured to talk to the tokenizer server in the
config.js (not provided).

Quite likely, the NLP server should be exposed outside of the cluster with an Ingress.
Ingress configuration is not provided because the syntax depends on the ingress
controller used (ALB or nginx).

## training.yaml

This file deploys a training controller server, with a corresponding service "training"
forwarding port 8090. A companion server is also provided in `gpu-training.yaml`, for
the GPU-specific parts of the training process.
