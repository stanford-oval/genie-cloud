#!/usr/bin/env python
#
##############################################################################
# Resolve Host Paths Transformer (Kustomize Exec Plugin)
# ============================================================================
#
# See adjacent README.md file.
#
##############################################################################

import yaml
import sys

from almond_cloud.config import CONFIG
from almond_cloud.etc.coll import dig


def transform_item(item):
    # print(
    #     f"TRANSFORMING {dig(item, 'kind')} {dig(item, 'metadata', 'name')}",
    #     file=sys.stderr,
    # )
    # yaml.safe_dump(item, sys.stderr)

    for volume in dig(
        item, "spec", "template", "spec", "volumes", not_found=[]
    ):
        if path := dig(volume, "hostPath", "path"):
            if path.startswith("//"):
                volume["hostPath"]["path"] = str(
                    CONFIG.cluster_root / path[2:])
    return item


def main():
    input = yaml.safe_load(sys.stdin)

    result = {
        "apiVersion": "config.kubernetes.io/v1",
        "kind": "ResourceList",
        "items": [transform_item(item) for item in input["items"]],
    }

    yaml.safe_dump(result, sys.stdout)


if __name__ == "__main__":
    main()
