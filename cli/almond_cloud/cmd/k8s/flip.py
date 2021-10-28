from typing import Iterable, List, NoReturn
from queue import Queue
from threading import Thread

from kubernetes import client, config
from kubernetes.watch import Watch
from kubernetes.client.models.v1_pod import V1Pod
from clavier import log as logging, arg_par, err, io

from almond_cloud.config import CONFIG

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


def match_pod_name(pod_names: Iterable[str], pod: V1Pod) -> bool:
    for name in pod_names:
        if pod.metadata.name == name or pod.metadata.name.startswith(
            f"{name}-"
        ):
            return True
    return False


def flip(pod_names: List[str]):
    config.load_kube_config()
    api_v1 = client.CoreV1Api()
    all_pods = api_v1.list_namespaced_pod(CONFIG.k8s.namespace).items
    pods = [pod for pod in all_pods if match_pod_name(pod_names, pod)]

    for pod in pods:
        LOG.info("Deleting pod...", name=pod.metadata.name)
        api_v1.delete_namespaced_pod(pod.metadata.name, CONFIG.k8s.namespace)
