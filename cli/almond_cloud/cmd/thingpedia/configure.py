from pathlib import Path
from typing import List

import splatlog as logging
from clavier import arg_par, sh

from almond_cloud.config import CONFIG
from almond_cloud.etc.path import TFilename

LOG = logging.getLogger(__name__)

DESC = f"""\
Configure a local thingpedia-common-devices clone to upload.
"""


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "configure",
        target=configure,
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
        "-u",
        "--url",
        default=CONFIG.thingpedia.url,
        help="URL to upload device to",
    )

    parser.add_argument("token", help="Upload user access token")


def obscure_token(key, value):
    if key == "thingpedia.access-token":
        value = value[:7] + "..." + value[-7:]
    return {"key": key, "value": value}


def configure(dir: TFilename, url: str, token: str):
    LOG.info("Configuring thingpedia-common-devices for upload...", dir=dir)

    for name, value in (("url", url), ("access-token", token)):
        key = f"thingpedia.{name}"
        sh.run(
            "git",
            "config",
            key,
            value,
            cwd=dir,
        )
        LOG.info("Configured", **obscure_token(key, value))
