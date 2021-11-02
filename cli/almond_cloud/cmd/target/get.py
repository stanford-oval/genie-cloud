from os import environ
from pathlib import Path
from typing import List

import splatlog as logging
from clavier import arg_par, sh

from almond_cloud.config import CONFIG
from almond_cloud.etc.path import TFilename
from almond_cloud.lib import targets

LOG = logging.getLogger(__name__)

DESC = f"""\
Get a target.
"""


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "get",
        target=get,
        help=DESC.splitlines()[0],
        description=DESC,
    )

    parser.add_argument(
        "target_name",
        default="local",
        help="Target name with the Thingpedia url and access-token to use",
    )


def get(target_name: str):
    return targets.get(target_name)
