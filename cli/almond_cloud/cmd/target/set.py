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
Set a target key to a value.
"""


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "set",
        target=target_set,
        help=DESC.splitlines()[0],
        description=DESC,
    )

    parser.add_argument(
        "target_name",
        default="local",
        help="Target name with the Thingpedia url and access-token to use",
    )

    parser.add_argument(
        "key",
        help="Key to set",
    )

    parser.add_argument(
        "value",
        help="Value to set",
    )


def target_set(target_name: str, key: str, value: str):
    return targets.set(target_name, key, value)
