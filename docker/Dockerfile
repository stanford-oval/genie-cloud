FROM registry.access.redhat.com/ubi8/ubi:latest

MAINTAINER Thingpedia Admins <thingpedia-admins@lists.stanford.edu>

# add epel repo
RUN dnf -y install wget && \
    wget https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm && \
    dnf -y install epel-release-latest-8.noarch.rpm

# add yarn repo
RUN curl -sL https://dl.yarnpkg.com/rpm/yarn.repo | tee /etc/yum.repos.d/yarn.repo

# add sqlcipher repo
RUN wget https://copr.fedorainfracloud.org/coprs/gcampax/sqlcipher/repo/epel-8/gcampax-sqlcipher-epel-8.repo -O /etc/yum.repos.d/gcampax-sqlcipher-epel-8.repo

# add bubblewrap repo
RUN wget https://copr.fedorainfracloud.org/coprs/gcampax/bubblewrap/repo/epel-8/gcampax-bubblewrap-epel-8.repo -O /etc/yum.repos.d/gcampax-bubblewrap-epel-8.repo

# install packages
RUN dnf -y install git gcc gcc-c++ make gettext unzip \
    python27 python3 python3-pip python3-devel && \
    dnf module install -y nodejs:10 && \
    dnf -y install yarn GraphicsMagick bubblewrap sqlcipher sqlcipher-devel && \
    rm -rf  /var/cache/dnf

# required by node-gyp
RUN alternatives --set python /usr/bin/python2

# install aws client
RUN pip3 install awscli
RUN curl --silent --location \
    "https://github.com/weaveworks/eksctl/releases/download/latest_release/eksctl_$(uname -s)_amd64.tar.gz" | \
    tar xz -C /usr/local/bin

# install cvc4
RUN wget https://almond-static.stanford.edu/test-data/cvc4-1.6-x86_64-linux-opt -O /usr/local/bin/cvc4

# copy source and install packages
COPY . /opt/almond-cloud/
WORKDIR /opt/almond-cloud/
RUN echo "build_from_source true" > .yarnrc && echo "sqlite_libname sqlcipher" >> .yarnrc
RUN yarn install

# add user almond-cloud
RUN useradd -ms /bin/bash -r almond-cloud
USER almond-cloud

WORKDIR /home/almond-cloud
ENTRYPOINT ["/bin/bash", "/opt/almond-cloud/docker/start.sh"]
