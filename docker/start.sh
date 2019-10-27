#!/bin/bash
set -x
if [ -e /usr/bin/scl_source ]; then
  source scl_source enable rh-python36 
fi
NODE_MAX_OLD_SPACE_SIZE=${NODE_MAX_OLD_SPACE_SIZE:-500}
node --max_old_space_size=${NODE_MAX_OLD_SPACE_SIZE} /opt/almond-cloud/main.js $*
