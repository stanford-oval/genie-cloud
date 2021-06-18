#!/bin/sh

set -e
set -x

mkdir geckodriver/
wget https://github.com/mozilla/geckodriver/releases/download/v0.22.0/geckodriver-v0.22.0-linux64.tar.gz
tar xvf geckodriver-v0.22.0-linux64.tar.gz -C geckodriver/

sudo add-apt-repository -y ppa:openstack-ci-core/bubblewrap
sudo apt-get update -q -y
sudo apt-get install -y graphicsmagick libsystemd-dev bubblewrap python3

mysql -u root -e "
create database if not exists thingengine_test;
grant all privileges on thingengine_test.* to 'thingengine'@'%' identified by 'thingengine';
"
