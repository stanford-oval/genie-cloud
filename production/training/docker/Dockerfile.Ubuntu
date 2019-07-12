FROM ubuntu:18.04

MAINTAINER Almond Admin <root@almond.stanford.edu>

# args can be set using --build-args, e.g.:
# --build-arg ALMOUND_CLOUD_VERSION=v1.4.0
ARG ALMOND_CLOUD_VERSION=v1.5.1

# install base packages
RUN apt-get update && apt-get install -y \
  curl wget gnupg gnupg2 gnupg1 python3 vim net-tools

# add latest 10.x nodejs
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -

# add yarn
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list

# install dependent pacakges
RUN apt-get update && apt-get install -y \
  nodejs cvc4 graphicsmagick libsystemd-dev \
  yarn python3-pip git \
  openjdk-8-jdk ant \
  gawk pkg-config libhunspell-dev python3-yaml gettext && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

# install  decanlp
RUN pip3 install --user 'git+https://github.com/stanford-oval/decaNLP.git#egg=decanlp'

# downlod source
WORKDIR /home/source
RUN git clone --branch=${ALMOND_CLOUD_VERSION} https://github.com/stanford-oval/almond-cloud.git
# from master (no release branch)
RUN git clone https://github.com/stanford-oval/almond-tokenizer.git

# build almond-tokenizer
WORKDIR /home/source/almond-tokenizer/
RUN ./pull-dependencies.sh 
RUN JAVAHOME=/usr/lib/jvm/java-8-openjdk-amd64/ ant

# build training
WORKDIR /home/source/almond-cloud/
RUN yarn install

WORKDIR /home/bin
COPY startup.sh /home/bin/startup.sh

WORKDIR /home/workdir
CMD ["/bin/bash", "/home/bin/startup.sh"]
