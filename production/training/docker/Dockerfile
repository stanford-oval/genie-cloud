FROM ${REPO}/almond/base

MAINTAINER Almond Admin <root@almond.stanford.edu>

# args can be set using --build-args, e.g.:
# --build-arg ALMOUND_CLOUD_VERSION=production
ARG ALMOND_CLOUD_VERSION=master
ARG DECANLP_VERSION=f5ea63ecb0abdd3bf50561b8f04a3aed6892e84f

# install other dependencies
RUN yum -y install \
	GraphicsMagick \
        systemd-devel \
        bubblewrap

# install cuda
RUN wget http://developer.download.nvidia.com/compute/cuda/repos/rhel7/x86_64/cuda-repo-rhel7-10.1.168-1.x86_64.rpm
RUN rpm -ivh cuda-repo-rhel7-10.1.168-1.x86_64.rpm
ENV CUDA_VERSION 10.1.168
ENV CUDA_PKG_VERSION 10-1-$CUDA_VERSION-1
RUN yum install -y \
        cuda-cudart-$CUDA_PKG_VERSION \
        cuda-compat-10-1 \
        cuda-libraries-$CUDA_PKG_VERSION  \
        cuda-nvtx-$CUDA_PKG_VERSION \
        cuda-libraries-dev-$CUDA_PKG_VERSION \
        cuda-nvml-dev-$CUDA_PKG_VERSION \
        cuda-minimal-build-$CUDA_PKG_VERSION \
        cuda-command-line-tools-$CUDA_PKG_VERSION && \
    ln -s cuda-10.1 /usr/local/cuda

# setup working dir
WORKDIR /var/lib/almond-training
COPY training.conf.json  training.conf.json
COPY startup.sh startup.sh
RUN chmod 755 startup.sh
RUN wget https://parmesan.stanford.edu/glove/ppdb-2.0-m-lexical.bin && \
    chmod 755 ppdb-2.0-m-lexical.bin 
RUN chown -R almond-prod:almond-prod /var/lib/almond-training/
USER almond-prod

# install decanlp
RUN pip3 install --user "git+https://github.com/stanford-oval/decaNLP.git@${DECANLP_VERSION}#egg=decanlp"

# downlod source and install packages
WORKDIR /home/almond-prod
RUN mkdir -p src && cd src && \
    git clone --branch=${ALMOND_CLOUD_VERSION} https://github.com/stanford-oval/almond-cloud.git
WORKDIR /home/almond-prod/src/almond-cloud/
RUN yarn install

WORKDIR /var/lib/almond-training
# embeddings will be downloaded form S3 at startup to reduce the size of this image.
ENV S3_DECANLP_EMBEDDINGS=s3://almond-training/embeddings.tar.gz
ENV DECANLP_EMBEDDINGS=/var/lib/almond-training/share/embeddings
RUN mkdir -p ${DECANLP_EMBEDDINGS}

# entry point
CMD ["/bin/bash", "/var/lib/almond-training/startup.sh"]
