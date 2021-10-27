from __future__ import annotations

from clavier import Sesh

from almond_cloud.config import CONFIG # NEED this FIRST!
from almond_cloud import cmd


def run():
    sesh = Sesh(
        __name__,
        CONFIG.paths.cli.root / "README.md",
        cmd.add_to
    )
    sesh.setup(CONFIG.log.level)
    sesh.parse()
    sesh.exec()
