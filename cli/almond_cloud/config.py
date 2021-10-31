from pathlib import Path

from clavier import CFG, io

__all__ = ["CONFIG"]

with CFG.configure("almond_cloud", src=__file__) as pkg:
    pkg.name = "almond-cloud"
    pkg.root = Path(__file__).resolve().parents[2]

    with pkg.configure("log") as log:
        log.level = "INFO"

    with pkg.configure("image") as image:
        image.name = "localhost/almond-cloud"

    with pkg.configure("k8s") as k8s:
        k8s.namespace = "almond-dev"

        k8s.name_groups = {
            "image": [
                "dbproxy",
                "frontend",
                "shared-backend",
                "nlp",
            ]
        }

    with pkg.configure("kust") as kust:
        kust.kustomizations_dir = pkg.root / "k8s" / "kustomizations"
        kust.dump_dir = pkg.root / "tmp" / "kustomized"

        # Where our Kustomize plugins live.
        kust.plugins_dir = pkg.root / "k8s" / "plugins"

with CFG.configure(io.rel, src=__file__) as rel:
    rel.to = CFG.almond_cloud.root

CONFIG = CFG.almond_cloud
