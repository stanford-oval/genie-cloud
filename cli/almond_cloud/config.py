from pathlib import Path

from clavier import CFG, io

with CFG.configure("almond_cloud", src=__file__) as cloud:
    cloud.name = "almond-cloud"

    with cloud.configure("log") as log:
        log.level = "INFO"

    with cloud.configure("paths") as paths:
        paths.repo = Path(__file__).resolve().parents[2]

        with paths.configure("tmp") as tmp:
            tmp.root = paths.repo / "tmp"

        with paths.configure("cli") as cli:
            cli.root = paths.repo / "cli"

        with paths.configure("src") as src:
            src.root = paths.repo / "src"

    with cloud.configure("image") as image:
        image.name = "localhost/almond-cloud"

    with cloud.configure("k8s") as k8s:
        k8s.namespace = "almond-dev"

        k8s.container_pod_prefixes = [
            "dbproxy-",
            "frontend-",
            "shared-backend-",
            "nlp-",
        ]

with CFG.configure(io.rel, src=__file__) as rel:
    rel.to = CFG.almond_cloud.paths.repo

CONFIG = CFG.almond_cloud
