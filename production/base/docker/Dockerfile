FROM registry.access.redhat.com/rhel7/rhel

MAINTAINER Almond Admin <root@almond.stanford.edu>

WORKDIR /tmp/downloads

# add redhat repos
RUN yum-config-manager \
	--enable rhel-server-rhscl-7-rpms  \
	--enable rhel-7-server-optional-rpms 

# install basic tools
RUN yum -y install  wget curl vim net-tools iputils redhat-lsb-core

# add epel repo 
RUN wget http://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
RUN rpm -ivh epel-release-latest-7.noarch.rpm

# install python3
RUN yum -y install @development \
	python36 \
	python36-numpy \
	python36-scipy \
	python36-PyYAML \
        python36-pip \
	python36-devel

# install nodejs 10.x and yarn
RUN curl -sL https://rpm.nodesource.com/setup_10.x | bash -
RUN curl -sL https://dl.yarnpkg.com/rpm/yarn.repo | tee /etc/yum.repos.d/yarn.repo
RUN yum -y install nodejs yarn

# add user almond-prod
RUN useradd -ms /bin/bash almond-prod
ENV PATH=/home/almond-prod/.local/bin:${PATH}

# setup working dir
USER almond-prod

# install aws client
RUN pip3 install --user awscli
RUN curl --silent --location \
    "https://github.com/weaveworks/eksctl/releases/download/latest_release/eksctl_$(uname -s)_amd64.tar.gz" | \
    tar xz -C /home/almond-prod/.local/bin

USER root
