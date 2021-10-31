#!/usr/bin/env python

import yaml
import sys
import os.path

from clavier import sh


def main():
    input = yaml.safe_load(sys.stdin)

    print(f"INPUT\n", file=sys.stderr)
    yaml.safe_dump(input, sys.stderr)

    repo_root = sh.get("git", "rev-parse", "--show-toplevel", format="strip")

    volumes = [
        {"name": name, "hostPath": {"path": os.path.join(repo_root, path)}}
        for name, path in [
            ["src", "src"],
            ["views", "views"],
            ["shared", "tmp/shared"],
        ]
    ]

    item = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
            "name": "nlp",
            "annotations": {"kustomize.config.k8s.io/behavior": "merge"},
        },
        "spec": {"template": {"spec": {"volumes": volumes}}},
    }

    result = {
        "apiVersion": "config.kubernetes.io/v1",
        "kind": "ResourceList",
        "items": [item],
    }

    yaml.safe_dump(result, sys.stdout)


if __name__ == "__main__":
    main()
