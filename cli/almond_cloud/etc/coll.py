##############################################################################
# Collection Manipulators
# ============================================================================
##############################################################################

from typing import Mapping, Sequence


def dig(target, *path, not_found=None):
    while len(path) > 0:
        key, *path = path
        if isinstance(target, Mapping):
            if key in target:
                target = target[key]
            else:
                return not_found
        elif isinstance(target, Sequence):
            if isinstance(key, int):
                if key > len(target):
                    return not_found
                target = target[key]
            else:
                return not_found
        else:
            return not_found
    return target
