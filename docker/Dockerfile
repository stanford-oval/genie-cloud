# build go binary first
FROM golang:1.16 as builder
WORKDIR /home/almond-cloud
RUN mkdir gosrc
ADD go gosrc
WORKDIR /home/almond-cloud/gosrc/backend
# binaries are installed to /go/bin
RUN go install

FROM registry.access.redhat.com/ubi8/ubi:latest

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

RUN pip3 install awscli && rm -fr /root/.cache

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
