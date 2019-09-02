set -exuo pipefail

# Download embeddings from s3
EMBEDDINGS_TAR_FILE=$(basename $S3_DECANLP_EMBEDDINGS)
aws s3 cp $S3_DECANLP_EMBEDDINGS $EMBEDDINGS_TAR_FILE
tar -xvzf $EMBEDDINGS_TAR_FILE -C $DECANLP_EMBEDDINGS
rm -f $EMBEDDINGS_TAR_FILE

# Download models
S3_NL_MODEL_DIR=`/home/almond-prod/src/almond-cloud/scripts/config_get.js NL_MODEL_DIR`
aws s3 sync $S3_NL_MODEL_DIR .

/usr/bin/node /home/almond-prod/src/almond-cloud/nlp/main.js
