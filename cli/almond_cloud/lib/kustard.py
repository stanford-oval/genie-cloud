##############################################################################
# Kustard — Kustom Kustomize Tooling
# ============================================================================
##############################################################################

from os import environ
from typing import (
    Any,
    Iterable,
    Iterator,
    Mapping,
    Optional,
    Tuple,
    Union,
    TypedDict,
)
import yaml
from pathlib import Path
from shutil import rmtree

from clavier import sh
import splatlog as logging

from almond_cloud.etc.coll import dig
from almond_cloud.etc.path import TFilename, add_ext, path_for

from almond_cloud.config import CONFIG


LOG = logging.getLogger(__name__)

YAML_EXTS = (".yaml", ".yml")

DEFAULT_BUILD_OPTS = {
    "enable-alpha-plugins": True,
    "enable-exec": True,
    "load-restrictor": "LoadRestrictionsNone",
}


TDoc = Any
TPathDoc = Tuple[Path, TDoc]
TBuildOps = Mapping[str, Any]


def is_kind(doc: TDoc, kind: str) -> bool:
    return dig(doc, "kind") == kind


def plugin_dirs() -> Iterable[Path]:
    return (dir for dir in CONFIG.kust.plugins_dir.iterdir() if dir.is_dir())


def build_PATH() -> str:
    return ":".join(str(p) for p in plugin_dirs()) + ":" + environ["PATH"]


def build_env() -> Mapping[str, str]:
    return {
        **environ,
        # Didn't work...
        # "KUSTOMIZE_PLUGIN_HOME": str(CONFIG.kust.plugins_dir),
        "PATH": build_PATH(),
    }


def build_opts(options: Optional[TBuildOps] = None) -> TBuildOps:
    if options is None:
        return DEFAULT_BUILD_OPTS
    return {**DEFAULT_BUILD_OPTS, **options}


def build(src: TFilename, options: Optional[TBuildOps] = None) -> str:
    path = str(CONFIG.kust.plugins_dir / "resolvehostpaths")
    return sh.get(
        "kustomize",
        "build",
        build_opts(options),
        src,
        env=build_env(),
    )


@LOG.inject
def apply(
    src: TFilename,
    *,
    log: logging.TLogger = LOG,
    build_options: Optional[TBuildOps] = None,
    kubectl_context: Optional[str] = None,
) -> sh.CompletedProcess:
    LOG.debug(
        "Applying Kustomize build...",
        build_options=build_options,
        kubectl_context=kubectl_context,
    )
    build_output = build(src, options=build_options)
    return sh.run(
        "kubectl",
        {"context": kubectl_context},
        "apply",
        "--filename",
        "-",
        input=build_output,
    )


def load_build(src: TFilename, build_options=None) -> Iterator[TDoc]:
    return yaml.safe_load_all(build(src, options=build_options))


def load_doc(filename: TFilename) -> TDoc:
    with path_for(filename).open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def rel_path_for(doc) -> Path:
    kind = doc["kind"]
    namespace = dig(doc, "metadata", "namespace", not_found="default")
    name = dig(doc, "metadata", "name")

    if kind == "Namespace":
        return Path(name, "Namespace.yaml")
    return Path(namespace, name, f"{kind}.yaml")


def dump(src: TFilename, dest: TFilename, build_options=None):
    dest = path_for(dest)
    if dest.exists():
        if dest.is_dir():
            rmtree(dest)
        else:
            raise Exception(f"`dest` exists and is _not_ a directory: {dest}")
    for doc in load_build(src, build_options=build_options):
        filename = dest / rel_path_for(doc)
        filename.parent.mkdir(parents=True, exist_ok=True)
        with filename.open("w", encoding="utf-8") as file:
            yaml.safe_dump(doc, file)


def yaml_paths(root: TFilename) -> Iterable[Path]:
    for ext in YAML_EXTS:
        yield from root.glob(f"**/*{ext}")


def yaml_docs(root: TFilename) -> Iterable[TPathDoc]:
    for path in yaml_paths(root):
        yield (path, load_doc(path))


def yaml_file_exists(basename: TFilename) -> bool:
    return yaml_file_path(basename) is not None


def yaml_file_path(basename: TFilename) -> Optional[Path]:
    for ext in YAML_EXTS:
        path = add_ext(basename, ext)
        if path.is_file():
            return path


def find_by_kind(root: TFilename, kind: str) -> Iterable[TPathDoc]:
    for path, doc in yaml_docs(root):
        if is_kind(doc, kind):
            yield (path, doc)


def find_kustomizations(root: TFilename) -> Iterable[TPathDoc]:
    yield from find_by_kind(root, "Kustomization")
