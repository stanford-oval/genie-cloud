from pathlib import Path
from typing import Union

TFilename = Union[str, Path]


def path_for(filename: TFilename) -> Path:
    if isinstance(filename, Path):
        return filename
    return Path(filename)


def dot_ext(ext: str) -> str:
    if ext.startswith("."):
        return ext
    return f".{ext}"


def undot_ext(ext: str) -> str:
    if ext.startswith("."):
        return ext[1:]
    return ext


def add_ext(filename: TFilename, ext: str) -> Path:
    path = path_for(filename)
    return path.parent / (path.name + dot_ext(ext))
