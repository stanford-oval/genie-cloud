#!/bin/bash
NODE_MAX_OLD_SPACE_SIZE=${NODE_MAX_OLD_SPACE_SIZE:-500}
exec node --max_old_space_size=${NODE_MAX_OLD_SPACE_SIZE} /opt/almond-cloud/dist/main.js "$@"
