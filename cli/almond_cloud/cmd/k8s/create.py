from clavier import arg_par, sh

from almond_cloud.config import CONFIG
from almond_cloud.lib import kustard


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "create",
        target=create,
        help="Create (bootstrap) the deployment",
    )


def create():
    src = CONFIG.kust.kustomizations_dir / "dev" / "bootstrap"
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
