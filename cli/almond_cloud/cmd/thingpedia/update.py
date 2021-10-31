from pathlib import Path
from typing import List

import splatlog as logging
from clavier import arg_par


LOG = logging.getLogger(__name__)

DESC = f"""\
Update a skill -- remove previous build, make, upload.
"""


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "update",
        target=update,
        help=DESC.splitlines()[0],
        description=DESC,
    )

    parser.add_argument(
        "-d",
        "--thingpedia-dir",
        dest="tpDir",
        help="Where to find thingpedia-common-devices",
    )

    parser.add_argument(
        "skill",
        nargs="+",
        help="Skill(s) to update",
    )


def skill_names(tpDir: Path) -> List[str]:
    return tpDir.glob("**/manifest.tt")


def update(pod_names: List[str]):
    skill_names()
