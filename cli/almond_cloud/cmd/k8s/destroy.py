from clavier import arg_par
from kubernetes import client, config
import splatlog as logging

from almond_cloud.config import CONFIG

LOG = logging.getLogger(__name__)


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "destroy",
        target=destroy,
        help="Knock out the deployment completely (delete namespace)",
    )


def destroy():
    config.load_kube_config()
    api_v1 = client.CoreV1Api()
    status = api_v1.delete_namespace(
        CONFIG.k8s.namespace, grace_period_seconds=0
    )
    LOG.info(
        "Namespace deleted",
        namespace=CONFIG.k8s.namespace,
        status=status,
    )
