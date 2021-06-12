# override this to "nvidia/cuda:10.1-runtime-ubi8" if cuda is desired
ARG BASE_IMAGE=registry.access.redhat.com/ubi8/ubi:latest

# build go binary first
FROM golang:1.16 as builder
WORKDIR /home/almond-cloud
RUN mkdir gosrc
ADD go gosrc
WORKDIR /home/almond-cloud/gosrc/backend
# binaries are installed to /go/bin
RUN go install

FROM ${BASE_IMAGE}

MAINTAINER Thingpedia Admins <thingpedia-admins@lists.stanford.edu>

USER root

# Copy go binary
COPY --from=builder /go/bin/backend /usr/local/bin/backend

# add all the repos: epel (for GraphicsMagick), yarn, sqlcipher, bubblewrap,
# then install the packages needed at runtime
#
# "touch" is a workaround for https://bugzilla.redhat.com/show_bug.cgi?id=1213602
# (https://github.com/moby/moby/issues/10180)
# which apparently still exists and is causing failures on the dockerhub autobuilds
RUN touch /var/lib/rpm/* && \
  curl -sL https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm -o epel-release-latest-8.noarch.rpm && \
  dnf -y install epel-release-latest-8.noarch.rpm && \
  curl -sL https://copr.fedorainfracloud.org/coprs/gcampax/sqlcipher/repo/epel-8/gcampax-sqlcipher-epel-8.repo -o /etc/yum.repos.d/gcampax-sqlcipher-epel-8.repo && \
  curl -sL https://copr.fedorainfracloud.org/coprs/gcampax/bubblewrap/repo/epel-8/gcampax-bubblewrap-epel-8.repo -o /etc/yum.repos.d/gcampax-bubblewrap-epel-8.repo && \
  dnf module install -y nodejs:12 && \
  dnf -y install zip unzip GraphicsMagick bubblewrap sqlcipher sqlcipher-devel procps-ng \
    python38 python38-pip git make gettext && \
  rm -rf /var/cache/dnf

# HACK: we need to download the wheel manually or docker will die
RUN curl -sL https://files.pythonhosted.org/packages/1d/a9/f349273a0327fdf20a73188c9c3aa7dbce68f86fad422eadd366fd2ed7a0/torch-1.7.1-cp38-cp38-manylinux1_x86_64.whl \
           -o torch-1.7.1-cp38-cp38-manylinux1_x86_64.whl \
        && pip3 install torch-1.7.1-cp38-cp38-manylinux1_x86_64.whl \
        && rm -fr torch-1.7.1-cp38-cp38-manylinux1_x86_64.whl \
        && rm -fr /root/.cache
RUN dnf -y install cmake gcc gcc-c++ python38-devel && \
   pip3 install genienlp==0.6.0 awscli && \
   dnf -y remove cmake gcc gcc-c++ python38-devel && \
   rm -fr /var/cache/dnf && \
   rm -fr /root/.cache

# ensures python sys.std* encoding is always utf-8
ENV PYTHONIOENCODING=UTF-8

# add user almond-cloud
RUN useradd -ms /bin/bash -r almond-cloud && id almond-cloud

# copy source and install packages
COPY --chown=almond-cloud:almond-cloud . /opt/almond-cloud/
WORKDIR /opt/almond-cloud/
RUN echo "build_from_source = true" > .npmrc && \
  echo "sqlite = external" >> .npmrc && \
  echo "sqlite_libname = sqlcipher" >> .npmrc

# install build dependencies and build
# note: npm doesn't like running as root, so we need to run in a normal
# user and then fix up the permissions later
RUN touch /var/lib/rpm/* && \
  dnf -y install python27 gcc gcc-c++ sqlcipher-devel && \
  alternatives --set python /usr/bin/python2 && \
  su almond-cloud -c 'CPLUS_INCLUDE_PATH=/usr/include/sqlcipher npm ci' && \
  chown -R root:root /opt/almond-cloud && \
  dnf -y remove python27 gcc gcc-c++ sqlcipher-devel && \
  rm -fr /root/.cache && \
  rm -fr /var/cache/dnf



USER almond-cloud
WORKDIR /home/almond-cloud
ENTRYPOINT ["/opt/almond-cloud/docker/start.sh"]
