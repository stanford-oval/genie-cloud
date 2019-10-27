#!/bin/bash
set -x
source scl_source enable rh-python36 
NODE_MAX_OLD_SPACE_SIZE=${NODE_MAX_OLD_SPACE_SIZE:-500}
node --max_old_space_size=${NODE_MAX_OLD_SPACE_SIZE} /opt/almond-cloud/main.js $*
