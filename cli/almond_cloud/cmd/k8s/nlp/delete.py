from argparse import BooleanOptionalAction
from almond_cloud.config import CONFIG

import splatlog as logging

from almond_cloud.lib import targets, kustard

LOG = logging.getLogger(__name__)

DESC = f"""\
Delete local nlp service.
"""

DEFAULT_DEBUG = False


def add_parser(subparsers):
    parser = subparsers.add_parser(
        "delete",
        target=delete,
        help=DESC.splitlines()[0],
        description=DESC,
    )

    parser.add_argument(
        "-d",
        "--debug",
        action=BooleanOptionalAction,
        default=DEFAULT_DEBUG,
        help="Use the debug version (live-coding, debugger port)",
    )


def delete(debug: bool = DEFAULT_DEBUG):
    target = targets.get("local")

    if debug:
        src = CONFIG.kust.kustomizations_dir / "debug" / "nlp"
    else:
        src = CONFIG.kust.kustomizations_dir / "dev" / "nlp"

    kustard.apply(src, kubectl_context=target.get("k8s.context"))
