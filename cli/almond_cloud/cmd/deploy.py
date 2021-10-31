from clavier import arg_par
import splatlog as logging

from almond_cloud.config import CONFIG
from .image.build import build_image
from .k8s.flip import flip


LOG = logging.getLogger(__name__)

DESC = f"""\
Rebuild the container and flip the pods that use it.
"""


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "deploy",
        target=deploy,
        help=DESC.splitlines()[0],
        description=DESC,
    )


def deploy():
    build_image()
    flip(["image"])
