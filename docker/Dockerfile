# override this to "stanfordoval/decanlp:latest-cuda" if cuda is desired
ARG BASE_IMAGE=stanfordoval/decanlp:latest
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
  dnf -y install unzip GraphicsMagick bubblewrap sqlcipher sqlcipher-devel procps-ng && \
  rm -rf /var/cache/dnf

# install aws client
RUN pip3 install awscli && rm -fr /root/.cache

# install cvc4
RUN curl -sL https://almond-static.stanford.edu/test-data/cvc4-1.6-x86_64-linux-opt -o /usr/local/bin/cvc4

# download classifer and PPDB
RUN mkdir -p /usr/local/share/almond-cloud/classifier && \
    curl -sL https://nnmaster.almond.stanford.edu/test-models/classifier1.tar.gz -o classifier1.tar.gz && \
    tar xvf classifier1.tar.gz -C /usr/local/share/almond-cloud/classifier && \
    rm -f classifier1.tar.gz
RUN touch /var/lib/rpm/* && \
    dnf -y install gcc gcc-c++ && \
    pip3 install wheel && \
    pip3 install pytorch_transformers==1.2.0 tensorboardX tqdm && \
    rm -fr /root/.cache && \
    dnf -y remove gcc gcc-c++ && \
    rm -fr /var/cache/dnf
ENV ALMOND_FRONTEND_CLASSIFIER=/usr/local/share/almond-cloud/classifier

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
