from pathlib import Path
from typing import Iterable

from almond_cloud.etc.path import TFilename, path_for
from almond_cloud.lib import kustard
from clavier import arg_par
import splatlog as logging

from almond_cloud.config import CONFIG

DESC = f"""\
Dump a `kustomize build` to a local directory with one YAML doc per file.

> **WARNING**
> This kills the destination directory (removes it first if it exists).

Splitting the `kustomize build` output up into individual,
hierarchically-organized files makes it easier (in my opinion) to sort through
exactly what is being generated for large builds.
"""

LOG = logging.getLogger(__name__)


def kustomization_names() -> Iterable[str]:
    for path, _doc in kustard.find_kustomizations(
        CONFIG.kust.kustomizations_dir
    ):
        yield str(path.parent.relative_to(CONFIG.kust.kustomizations_dir))


def kustomization_path_for(name: TFilename) -> Path:
    path = path_for(name)
    if kustard.yaml_file_exists(path / "kustomization"):
        # It's a path to a directory that has a `kustomization.y[a]ml` file,
        # so just return that
        return path

    path = CONFIG.kust.kustomizations_dir / name
    if kustard.yaml_file_exists(path / "kustomization"):
        # It's one of our "short names" -- relative paths from
        # `//k8s/kustomizations` directory
        return path

    raise ValueError(f"Doesn't look like a kustomization: {name!r}")


def dump(name: TFilename, dest: TFilename = CONFIG.kust.dump_dir):
    src = kustomization_path_for(name)
    LOG.debug("Dumping Kustomization...", name=name, src=src, dest=dest)
    kustard.dump(
        src,
        dest,
        build_options={
            "enable-alpha-plugins": True,
            "enable-exec": True,
        },
    )
    LOG.info(
        "Dumped Kustomize build output.",
        input=str(src),
        output=str(dest),
    )


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "dump",
        target=dump,
        help=DESC.splitlines()[0],
        description=DESC,
    )

    parser.add_argument(
        "name",
        choices=list(kustomization_names()),
        help="Which Kustomization to dump",
    )

    parser.add_argument(
        "-d",
        "--dest",
        default=CONFIG.kust.dump_dir,
        help="Where to write the dump tree (WARNING -- deletes it first!)",
    )
