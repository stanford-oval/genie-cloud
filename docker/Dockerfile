# override this to "nvidia/cuda:10.1-runtime-ubi7" if cuda is desired
ARG BASE_IMAGE=registry.access.redhat.com/ubi7/ubi:latest
FROM ${BASE_IMAGE}

MAINTAINER Thingpedia Admins <thingpedia-admins@lists.stanford.edu>

# install basic tools
RUN yum -y install git wget gcc gcc-c++ make

# add epel repo
RUN wget http://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
RUN yum -y install epel-release-latest-7.noarch.rpm

# install nodejs 10.x and yarn
RUN curl -sL https://rpm.nodesource.com/setup_10.x | bash -
RUN curl -sL https://dl.yarnpkg.com/rpm/yarn.repo | tee /etc/yum.repos.d/yarn.repo
RUN yum -y install nodejs yarn

# install python3
RUN yum -y install python36 \
	python36-numpy \
	python36-scipy \
	python36-PyYAML \
	python36-pip \
	python36-devel

# install aws client
RUN pip3 install awscli
RUN curl --silent --location \
    "https://github.com/weaveworks/eksctl/releases/download/latest_release/eksctl_$(uname -s)_amd64.tar.gz" | \
    tar xz -C /usr/local/bin

# install sqlcipher
RUN wget https://copr.fedorainfracloud.org/coprs/gcampax/sqlcipher/repo/epel-7/gcampax-sqlcipher-epel-7.repo -O /etc/yum.repos.d/gcampax-sqlcipher-epel-7.repo
RUN yum -y install sqlcipher sqlcipher-devel

# install cvc4
RUN wget https://almond-static.stanford.edu/test-data/cvc4-1.6-x86_64-linux-opt -O /usr/local/bin/cvc4

# install decanlp
ARG DECANLP_VERSION=48b88317b7fd1604ef0daf6eb0a9ab1a7ef82736
RUN pip3 install "git+https://github.com/stanford-oval/decaNLP.git@${DECANLP_VERSION}#egg=decanlp"

# install other dependencies
RUN yum -y install GraphicsMagick bubblewrap

# download word embeddings
ENV DECANLP_EMBEDDINGS=/usr/local/share/decanlp/embeddings
RUN mkdir -p ${DECANLP_EMBEDDINGS}
WORKDIR ${DECANLP_EMBEDDINGS}
RUN for v in charNgram glove.840B.300d ; do \
		for f in vectors table itos ; do \
			wget -c https://oval.cs.stanford.edu/data/glove/${v}.txt.${f}.npy ; \
		done ; \
	done

# download classifer and PPDB
RUN mkdir -p /usr/local/share/almond-cloud/classifier && \
    wget https://nnmaster.almond.stanford.edu/test-models/classifier1.tar.gz  && \
    tar xvf classifier1.tar.gz -C /usr/local/share/almond-cloud/classifier && \
    rm -f classifier1.tar.gz
RUN pip3 install pytorch_transformers tensorboardX tqdm
ENV ALMOND_FRONTEND_CLASSIFIER=/usr/local/share/almond-cloud/classifier

RUN wget https://parmesan.stanford.edu/glove/ppdb-2.0-m-lexical.bin -O /usr/local/share/ppdb-2.0-m-lexical.bin && \
    chmod 755 /usr/local/share/ppdb-2.0-m-lexical.bin
ENV PPDB=/usr/local/share/ppdb-2.0-m-lexical.bin

# copy source and install packages
COPY . /opt/almond-cloud/
WORKDIR /opt/almond-cloud/
RUN echo "build_from_source true" > .yarnrc && echo "sqlite_libname sqlcipher" >> .yarnrc
RUN yarn install

# add user almond-cloud
RUN useradd -ms /bin/bash -r almond-cloud
USER almond-cloud
WORKDIR /home/almond-cloud

