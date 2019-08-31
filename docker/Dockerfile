FROM registry.access.redhat.com/ubi7/ubi:latest

MAINTAINER Thingpedia Admins <thingpedia-admins@lists.stanford.edu>

# install basic tools
RUN yum -y install git wget gcc gcc-c++ make gettext

# add epel repo
RUN wget http://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
RUN yum -y install epel-release-latest-7.noarch.rpm

# install nodejs 10.x and yarn
RUN curl -sL https://rpm.nodesource.com/setup_10.x | bash -
RUN curl -sL https://dl.yarnpkg.com/rpm/yarn.repo | tee /etc/yum.repos.d/yarn.repo
RUN yum -y install nodejs yarn

# install python3
RUN yum -y install python36 \
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

# install other dependencies
RUN yum -y install GraphicsMagick bubblewrap

# copy source and install packages
COPY . /opt/almond-cloud/
WORKDIR /opt/almond-cloud/
RUN echo "build_from_source true" > .yarnrc && echo "sqlite_libname sqlcipher" >> .yarnrc
RUN yarn install

# add user almond-cloud
RUN useradd -ms /bin/bash -r almond-cloud
USER almond-cloud
WORKDIR /home/almond-cloud

