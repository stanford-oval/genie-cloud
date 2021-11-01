from typing import List, Optional

import splatlog as logging
from kubernetes import client, config
from clavier import arg_par

from almond_cloud.config import CONFIG
from almond_cloud.lib.k8s import match_pod_name, expand_names

LOG = logging.getLogger(__name__)

DESC = f"""\
"Flip" things by deleting pods and letting them be re-created.
"""


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "flip",
        target=flip,
        help=DESC.splitlines()[0],
        description=DESC,
    )

    parser.add_argument(
        "pod_names",
        nargs="+",
        help="Pods to follow, which are prefix-matched against the name",
    )

    parser.add_argument(
        "-c",
        "--context",
        default=None,
        help="kubectl context to use",
    )

    parser.add_argument("-n", "--namespace", default=CONFIG.k8s.namespace)


def flip(pod_names: List[str], namespace: str, context: Optional[str] = None):
    expanded_names = expand_names(pod_names)

    LOG.debug(
        "Flipping...",
        arg_names=pod_names,
        expanded_names=expanded_names,
        context=context,
        namespace=namespace,
    )

    config.load_kube_config(context=context)
    api_v1 = client.CoreV1Api()
    all_pods = api_v1.list_namespaced_pod(namespace).items
    pods = [pod for pod in all_pods if match_pod_name(expanded_names, pod)]

    for pod in pods:
        LOG.info("Deleting pod...", name=pod.metadata.name)
        api_v1.delete_namespaced_pod(pod.metadata.name, namespace)
