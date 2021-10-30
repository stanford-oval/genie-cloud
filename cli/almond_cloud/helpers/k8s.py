from typing import Iterable, List

from kubernetes.client.models.v1_pod import V1Pod

from almond_cloud.config import CONFIG


def match_pod_name(pod_names: Iterable[str], pod: V1Pod) -> bool:
    for name in pod_names:
        if pod.metadata.name == name or pod.metadata.name.startswith(
            f"{name}-"
        ):
            return True
    return False


def expand_names(names: List[str]) -> List[str]:
    expanded = set()
    for name in names:
        if name in CONFIG.k8s.name_groups:
            for n in CONFIG.k8s.name_groups[name]:
                expanded.add(n)
        else:
            expanded.add(name)
    return sorted(list(expanded))
