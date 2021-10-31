from clavier import arg_par, sh
import splatlog as logging

from almond_cloud.config import CONFIG
from almond_cloud.lib import kustard


LOG = logging.getLogger(__name__)


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "update",
        target=update,
        help="Update the deployment",
    )


def update():
    src = CONFIG.kust.kustomizations_dir / "dev" / "core"
    resources = kustard.build(
        src,
        options={
            "enable-alpha-plugins": True,
            "enable-exec": True,
        },
    )
    sh.run(
        "kubectl",
        "apply",
        "--filename",
        "-",
        input=resources,
    )
