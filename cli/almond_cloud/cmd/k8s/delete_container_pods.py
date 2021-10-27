from textwrap import dedent

from kubernetes import client, config
from clavier import log as logging

from almond_cloud.config import CONFIG

LOG = logging.getLogger(__name__)

DESC = f"""\
Deletes all the Kubernetes pods using the local `{CONFIG.image.name}` image.

Use this to force a refresh!
"""


def add_to(subparsers):
    parser = subparsers.add_parser(
        "delete-container-pods",
        target=delete_container_pods,
        help=f"Delete pods that run {CONFIG.image.name}",
        description=DESC,
    )


def delete_container_pods():
    config.load_kube_config()
    v1 = client.CoreV1Api()
    # ret = v1.list_pod_for_all_namespaces(watch=False)
    rsp = v1.list_namespaced_pod(CONFIG.k8s.namespace, watch=False)
    to_delete = {}
    for pod in rsp.items:
        for prefix in CONFIG.k8s.container_pod_prefixes:
            if pod.metadata.name.startswith(prefix):
                to_delete[pod.metadata.name] = pod
    for name, pod in to_delete.items():
        LOG.info("Deleting pod...", name=name)
        v1.delete_namespaced_pod(name, CONFIG.k8s.namespace)
