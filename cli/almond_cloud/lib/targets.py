from __future__ import annotations
from typing import Any, Callable, Dict, Iterable, List, Optional, Union
from subprocess import CalledProcessError
from almond_cloud.config import CONFIG

from clavier import sh
import splatlog as logging

LOG = logging.getLogger(__name__)

TValue = Any


GIT_CONFIG_PREFIX = "targets"
GIT_CONFIG_KEY_SEP = "."
GIT_CONFIG_LIST_SEP = ";"


def git_config_name(key_path: Union[str, Iterable[str]]) -> str:
    if isinstance(key_path, str):
        key_path = [key_path]
    return GIT_CONFIG_KEY_SEP.join(
        (
            GIT_CONFIG_PREFIX,
            *(key.replace("_", "-") for key in key_path),
        )
    )


def git_config_get(key_path: Union[str, Iterable[str]], *, type="str") -> str:
    try:
        value = sh.get(
            "git",
            "config",
            "--local",
            git_config_name(key_path),
            format="strip",
        )
    except CalledProcessError as error:
        if error.returncode == 1 and error.stdout == "":
            return None
        raise error
    if type == "Optional[List[str]]":
        return value.split(GIT_CONFIG_LIST_SEP)
    return value


def git_config_set(key_path: Union[str, Iterable[str]], value: TValue) -> None:
    if value is None:
        sh.run("git", "config", "--unset", git_config_name(key_path))
    else:
        sh.run(
            "git",
            "config",
            "--local",
            git_config_name(key_path),
            encode(value),
        )


def encode(value: TValue) -> str:
    if value is None or isinstance(value, str):
        return value
    if isinstance(value, (tuple, list)):
        for item in value:
            if not isinstance(item, str):
                raise TypeError(
                    "only lists/tuples of str accepted, " f"given {repr(value)}"
                )
            if GIT_CONFIG_LIST_SEP in item:
                raise ValueError(
                    "list/tuple items may not contain "
                    f"{repr(GIT_CONFIG_LIST_SEP)}, given {repr(value)}"
                )
        return GIT_CONFIG_LIST_SEP.join(value)
    raise TypeError(f"can't encode type {type(value)}: {repr(value)}")


def list() -> List[str]:
    config_names = sh.get(
        "git",
        "config",
        "--local",
        "--list",
    ).splitlines()

    return sorted(
        {
            parts[1]
            for parts in (name.split(".") for name in config_names)
            if parts[0] == GIT_CONFIG_PREFIX and len(parts) > 2
        }
    )


def get(target_name) -> Dict[str, str]:
    config_lines: List[str] = sh.get(
        "git",
        "config",
        "--local",
        "--list",
    ).splitlines()

    prefix = git_config_name(target_name) + GIT_CONFIG_KEY_SEP

    if target_name in CONFIG.targets:
        target = CONFIG.targets[target_name].to_dict()
    else:
        target = {}

    for line in config_lines:
        name, value = line.split("=", 1)
        if name.startswith(prefix):
            target[name.removeprefix(prefix)] = value

    return target
