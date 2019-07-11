set -x

onEnd() {
  kill -SIGTERM "$TOKENIZER_PID"
  exit 0
}

# Run tokenizer in background
cd /home/source/almond-tokenizer
PORT=8888 LANGUAGES=en ./run.sh &
TOKENIZER_PID=$!
trap onEnd SIGTERM SIGINT
sleep 5

# Run daemon server
cd /home/workdir
/usr/bin/node /home/source/almond-cloud/training/daemon.js
