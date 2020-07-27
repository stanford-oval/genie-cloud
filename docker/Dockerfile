# override this to "nvidia/cuda:10.1-runtime-ubi8" if cuda is desired
ARG BASE_IMAGE=registry.access.redhat.com/ubi8/ubi:latest
FROM ${BASE_IMAGE}

MAINTAINER Thingpedia Admins <thingpedia-admins@lists.stanford.edu>

USER root

# add all the repos: epel (for GraphicsMagick), yarn, sqlcipher, bubblewrap,
# then install the packages needed at runtime
#
# "touch" is a workaround for https://bugzilla.redhat.com/show_bug.cgi?id=1213602
# (https://github.com/moby/moby/issues/10180)
# which apparently still exists and is causing failures on the dockerhub autobuilds
RUN touch /var/lib/rpm/* && \
  curl -sL https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm -o epel-release-latest-8.noarch.rpm && \
  dnf -y install epel-release-latest-8.noarch.rpm && \
  curl -sL https://dl.yarnpkg.com/rpm/yarn.repo | tee /etc/yum.repos.d/yarn.repo && \
  curl -sL https://copr.fedorainfracloud.org/coprs/gcampax/sqlcipher/repo/epel-8/gcampax-sqlcipher-epel-8.repo -o /etc/yum.repos.d/gcampax-sqlcipher-epel-8.repo && \
  curl -sL https://copr.fedorainfracloud.org/coprs/gcampax/bubblewrap/repo/epel-8/gcampax-bubblewrap-epel-8.repo -o /etc/yum.repos.d/gcampax-bubblewrap-epel-8.repo && \
  dnf module install -y nodejs:10 && \
  dnf -y install unzip GraphicsMagick bubblewrap sqlcipher sqlcipher-devel procps-ng \
    python3 python3-numpy python3-scipy python3-pip git && \
  rm -rf /var/cache/dnf

# HACK: we need to download the wheel manually or docker will die
RUN curl -sL https://files.pythonhosted.org/packages/62/01/457b49d790b6c4b9720e6f9dbbb617692f6ce8afdaadf425c055c41a7416/torch-1.5.1-cp36-cp36m-manylinux1_x86_64.whl \
  -o torch-1.5.1-cp36-cp36m-manylinux1_x86_64.whl && \
  pip3 install torch-1.5.1-cp36-cp36m-manylinux1_x86_64.whl && \
  rm -fr /root/.cache && \
  rm -fr torch-1.5.1-cp36-cp36m-manylinux1_x86_64.whl
RUN pip3 install 'git+https://github.com/stanford-oval/genienlp@8cbfe50e0e92b97e68dc013a3c48788df23c2f7a#egg=genienlp' awscli && rm -fr /root/.cache

# install cvc4
RUN curl -sL https://almond-static.stanford.edu/test-data/cvc4-1.6-x86_64-linux-opt -o /usr/local/bin/cvc4

# ensures python sys.std* encoding is always utf-8
ENV PYTHONIOENCODING=UTF-8

# copy source and install packages
COPY . /opt/almond-cloud/
WORKDIR /opt/almond-cloud/
RUN echo "build_from_source true" > .yarnrc && echo "sqlite_libname sqlcipher" >> .yarnrc

# install build dependencies and build
RUN touch /var/lib/rpm/* && \
  dnf -y install make gettext python27 yarn gcc gcc-c++ sqlcipher-devel && \
  alternatives --set python /usr/bin/python2 && \
  yarn install && \
  dnf -y remove make gettext python27 yarn gcc gcc-c++ sqlcipher-devel && \
  rm -fr /root/.cache && \
  rm -fr /var/cache/dnf

# add user almond-cloud
RUN useradd -ms /bin/bash -r almond-cloud
USER almond-cloud
WORKDIR /home/almond-cloud

ENTRYPOINT ["/opt/almond-cloud/docker/start.sh"]
