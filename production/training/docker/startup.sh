set -exuo pipefail

# Download embeddings from s3
EMBEDDINGS_TAR_FILE=$(basename $S3_DECANLP_EMBEDDINGS)
aws s3 cp $S3_DECANLP_EMBEDDINGS $EMBEDDINGS_TAR_FILE
tar -xvzf $EMBEDDINGS_TAR_FILE -C $DECANLP_EMBEDDINGS
rm -f $EMBEDDINGS_TAR_FILE

RUN_GPU_DAEMON=${RUN_GPU_DAEMON:-}
if [ -z "$RUN_GPU_DAEMON" ]; then
    /usr/bin/node /home/almond-prod/src/almond-cloud/training/daemon.js
else
    /usr/bin/node /home/almond-prod/src/almond-cloud/training/gpu_training_daemon.js
fi
