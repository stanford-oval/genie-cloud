#!/bin/bash

# make sure we run on an UTF-8 locale
export LC_ALL=en_US.utf8

die() {
    echo "$@"
    exit 1
}

set -e
set -o pipefail

test -e /proc/self/fd/3 || exec 3>/dev/null
serverpid=""
on_error() {
    echo "failed" 1>&3
    test -n "$serverpid" && kill $serverpid
    wait
    serverpid=""
}
trap on_error ERR INT TERM

job_id=$1
lang=$2
model_tag=$3
shift
shift
shift
BASEDIR=`dirname $0`
BASEDIR=`realpath $BASEDIR`

test -z "$INFERENCE_SERVER" -o -z "$DATABASE_URL" -o -z "$NL_SERVER_ADMIN_TOKEN" -o -z "$THINGPEDIA_URL" && die "Must set INFERENCE_SERVER, DATABASE_URL, ADMIN_TOKEN and THINGPEDIA_URL in the environment"
set -x

test -f ${BASEDIR}/config.sh && . ${BASEDIR}/config.sh

train_steps=${train_steps:-100000}
synthetic_depth=${synthetic_depth:-4}
decode_hparams=${decode_hparams:-"beam_size=10,return_beams=true"}

HOMEDIR=${HOMEDIR:-`pwd`}
GLOVE=${GLOVE:-${HOMEDIR}/glove.42B.300d.txt}
PPDB=${PPDB:-${HOMEDIR}/ppdb-2.0-m-lexical.bin}
export GLOVE

JOBDIR="${HOMEDIR}/jobs/${job_id}"
mkdir ${JOBDIR}
mkdir -p ${HOMEDIR}/tensorboard/${model_tag}/${lang}
mkdir -p ${HOMEDIR}/saved-model/${model_tag}/${lang}
mkdir -p ${HOMEDIR}/dataset/${model_tag}/${lang}
ln -sf -T ${JOBDIR}/dataset ${HOMEDIR}/dataset/${model_tag}/${lang}/in-progress
ln -sf -T ${JOBDIR}/workdir/model ${HOMEDIR}/tensorboard/${model_tag}/${lang}/in-progress

echo "started" 1>&3

export DATASET=${JOBDIR}/dataset
export WORKDIR=${JOBDIR}/workdir
mkdir ${DATASET}
mkdir ${WORKDIR}
mkdir ${JOBDIR}/server

echo "gen_synthetic" 1>&3
node --max_old_space_size=24000 ${BASEDIR}/update-dataset.js -l ${lang} --all \
  --maxdepth ${synthetic_depth} \
  --ppdb ${PPDB}

echo "download_dataset" 1>&3
node ${BASEDIR}/download-dataset.js -l ${lang} --quote-free --train ${DATASET}/train.tsv --eval ${DATASET}/eval.tsv

echo "prepare" 1>&3
${LUINET_PATH}/luinet-datagen \
    --data_dir ${WORKDIR} \
    --src_data_dir ${DATASET} \
    --problem semparse_thingtalk_noquote \
    --thingpedia_snapshot -1 > ${JOBDIR}/datagen.log 2>&1

echo "training" 1>&3

${LUINET_PATH}/luinet/luinet-trainer \
    --data_dir ${WORKDIR} \
    --problem semparse_thingtalk_noquote \
    --model luinet_copy_transformer \
    --hparams_set transformer_tiny_luinet \
    --output_dir ${WORKDIR}/model \
    --train_steps ${train_steps} \
    --export_saved_model \
    --eval_early_stopping_metric metrics-semparse_thingtalk_noquote/accuracy \
    --noeval_early_stopping_metric_minimize \
    --decode_hparams "${decode_hparams}" \
    |& tee ${JOBDIR}/train.log | grep --line-buffered -o -E " step = [0-9]+ " | sed -u -e "s/[^0-9]//g" \
    | while read step ; do echo "progress:${step}/${train_steps}" 1>&3 ; done

best_model=`ls -d ${WORKDIR}/model/export/best/* | while read file ; do basename $file ; done | sort -n | tail -n1`
best_model_dir="${WORKDIR}/model/export/best/${best_model}"

test -d ${best_model_dir} || die "Did not produce a trained model"

echo '{
"problem": "semparse_thingtalk_noquote",
"model": "luinet_copy_transformer",
"hparams_set": "transformer_tiny_luinet",
"hparams_overrides": "",
"decode_hparams": "'${decode_hparams}'"
}' > ${best_model_dir}/model.json

# smoke-test the model by spinning up a server and firing some requests to it
echo "testing" 1>&3

port=$((1024+RANDOM%10000))
echo "[server]
port=${port}

[models]
${lang}=${best_model_dir}
" > ${JOBDIR}/server/server.conf

${LUINET_PATH}/luinet-server --config_file ${JOBDIR}/server/server.conf &
serverpid=$!

# wait 30 seconds for the server to start...
sleep 30

TEST_MODE=1 SEMPRE_URL="http://127.0.0.1:${port}" \
    node -e 'process.on("unhandledRejection", (up) => { throw up; }); require("'${BASEDIR}'/almond-dialog-agent/test/test_parser.js")();'

kill $serverpid
serverpid=""
wait

echo "uploading" 1>&3

model_lang_tag=
if test "${model_tag}" = "default" ; then
    model_lang_tag="${lang}"
else
    model_lang_tag="@${model_tag}/${lang}"
fi
model_lang_dir="${model_tag}:${lang}"

now=$(date "+%s")
#ln -sf -T ${JOBDIR} /srv/data/almond/${lang}/$now

rsync -rtv ${best_model_dir}/ ${INFERENCE_SERVER}:"/var/lib/luinet/${model_lang_dir}/"

test -a ${HOMEDIR}/saved-model/${model_tag}/${lang}/current && mv -T ${HOMEDIR}/saved-model/${model_tag}/${lang}/current ${HOMEDIR}/saved-model/${lang}/previous
ln -sf -T ${best_model_dir} ${HOMEDIR}/saved-model/${model_tag}/${lang}/current

test -a ${HOMEDIR}/tensorboard/${model_tag}/${lang}/current && mv -T ${HOMEDIR}/tensorboard/${model_tag}/${lang}/current ${HOMEDIR}/tensorboard/${model_tag}/${lang}/previous
ln -sf -T ${JOBDIR}/workdir/model ${HOMEDIR}/tensorboard/${model_tag}/${lang}/current
rm -f ${HOMEDIR}/tensorboard/${model_tag}/${lang}/in-progress

test -a ${HOMEDIR}/dataset/${model_tag}/${lang}/current && mv -T ${HOMEDIR}/dataset/${model_tag}/${lang}/current ${HOMEDIR}/dataset/${model_tag}/${lang}/previous
ln -sf -T ${JOBDIR}/dataset ${HOMEDIR}/dataset/${model_tag}/${lang}/current
rm -f ${HOMEDIR}/dataset/${model_tag}/${lang}/in-progress

#( cd /srv/data/almond/${model_tag}/${lang}/$now ; tar cJf ../$now.tar.xz . )
#ln -sf -T /srv/data/almond/${model_tag}/${lang}/$now.tar.xz /srv/data/almond/${model_tag}/${lang}/current.tar.xz

set +x
curl -f --silent --show-error -XPOST "https://${INFERENCE_SERVER}/@${model_tag}/${lang}/admin/reload?admin_token=${NL_SERVER_ADMIN_TOKEN}"

echo "success" 1>&3
