from pathlib import Path
import shutil

from clavier import CFG, io

__all__ = ["CONFIG"]

with CFG.configure("almond_cloud", src=__file__) as pkg:
    pkg.name = "almond-cloud"

    pkg.root = Path(__file__).resolve().parents[2]
    if shutil.which('kind'):
        # inside kind, the true host directory is mounted to /host in the kind node container
        # (which is the host for the k8s pods)
        pkg.cluster_root = Path('/host')
    else:
        pkg.cluster_root = pkg.root

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
            ],
            "skills": [
                "shared-backend",
                "user",
            ],
        }

    with pkg.configure("kust") as kust:
        kust.kustomizations_dir = pkg.root / "k8s" / "kustomizations"
        kust.dump_dir = pkg.root / "tmp" / "kustomized"

        # Where our Kustomize plugins live.
        kust.plugins_dir = pkg.root / "k8s" / "plugins"

    with pkg.configure("thingpedia") as tp:
        tp.dir = pkg.root.parent / "thingpedia-common-devices"

    with pkg.configure("targets") as targets:
        # Local development instance
        with targets.configure("local") as local:
            with local.configure("thingpedia") as local_tp:
                local_tp.url = "http://localhost:8080/thingpedia"
            with local.configure("k8s") as local_k8s:
                local_k8s.namespace = "almond-dev"

        # Dev (also referred to as "staging") instance
        with targets.configure("dev") as dev:
            with dev.configure("thingpedia") as dev_tp:
                dev_tp.url = "https://dev.genie.stanford.edu/thingpedia"
            with dev.configure("k8s") as dev_k8s:
                dev_k8s.context = "serving"
                dev_k8s.namespace = "staging"


with CFG.configure(io.rel, src=__file__) as rel:
    rel.to = CFG.almond_cloud.root

CONFIG = CFG.almond_cloud
