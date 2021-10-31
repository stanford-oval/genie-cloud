from argparse import BooleanOptionalAction
import splatlog as logging

from clavier import sh

from almond_cloud.config import CONFIG


LOG = logging.getLogger(__name__)


def add_to(subparsers):
    parser = subparsers.add_parser(
        "build", target=build_image, help=f"Build {CONFIG.image.name}"
    )

    parser.add_argument(
        "-p",
        "--plain",
        action=BooleanOptionalAction,
        default=False,
        help="Pass `--progress plain` to `docker build` (real Docker only!)",
    )


def build_image(plain: bool = False):
    opts = {
        "tag": CONFIG.image.name,
        "file": CONFIG.root / "docker" / "Dockerfile",
    }

    if plain:
        opts["progress"] = "plain"

    sh.run(
        "docker",
        "build",
        opts,
        ".",
        cwd=CONFIG.root,
        log=LOG,
        rel_paths=True,
        opts_style=" ",
    )
