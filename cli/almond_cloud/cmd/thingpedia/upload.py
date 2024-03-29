from os import environ
from pathlib import Path
from typing import List
from argparse import BooleanOptionalAction

import splatlog as logging
from clavier import arg_par, sh

from almond_cloud.config import CONFIG
from almond_cloud.etc.path import TFilename
from almond_cloud.lib import targets
from almond_cloud.cmd.k8s.flip import flip as flip_cmd

LOG = logging.getLogger(__name__)

DESC = f"""\
Upload skills.

**IMPORTANT** This command sets the Thingpedia URL and access token in
environment variables, which will only be read if the
`thingpedia-common-devices` checkout used does _NOT_ have `thingpedia.url`
and `thingpedia.access-token` set in it's `git config`.
"""

DEFAULT_FLIP = False


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "upload",
        target=upload,
        help=DESC.splitlines()[0],
        description=DESC,
    )

    parser.add_argument(
        "-d",
        "--directory",
        dest="dir",
        default=CONFIG.thingpedia.dir,
        help="Where to find thingpedia-common-devices",
    )

    parser.add_argument(
        "-t",
        "--target",
        dest="target_name",
        default="local",
        help="Target name with the Thingpedia url and access-token to use",
    )

    parser.add_argument(
        "-f",
        "--flip",
        action=BooleanOptionalAction,
        default=DEFAULT_FLIP,
        help="Flip the 'skill' pods after deploy",
    )

    parser.add_argument(
        "skills",
        nargs="+",
        help=(
            "Args to pass to `upload-all.sh`, or 'demo' to use `upload-demo.sh`"
        ),
    )


def upload_run(dir, url, token, *cmd):
    return sh.run(
        *cmd,
        cwd=dir,
        env={
            **environ,
            "THINGPEDIA_URL": url,
            "THINGPEDIA_ACCESS_TOKEN": token,
        },
    )


def upload_demo(dir: TFilename, url: str, token: str):
    LOG.info("Uploading all DEMO skills...", url=url)
    upload_run(
        dir,
        url,
        token,
        "./scripts/upload-demo.sh",
    )


def upload(
    dir: TFilename,
    target_name: str,
    skills: List[str],
    flip: bool = DEFAULT_FLIP,
):
    target = targets.get(target_name)

    url = target["thingpedia.url"]
    token = target["thingpedia.access-token"]

    if len(skills) == 1 and skills[0] == "demo":
        return upload_demo(dir, url, token)

    LOG.info("Uploading skills...", url=url, skills=skills)

    upload_run(
        dir,
        url,
        token,
        "./scripts/upload-all.sh",
        *skills,
    )

    if flip:
        flip_cmd(["skills"], target_name)
