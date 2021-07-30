#!/bin/bash

set -e
set -x

cd docker

export DOCKERFILE_PATH=docker/Dockerfile
export DOCKER_REPO=stanfordoval/almond-cloud

export IMAGE_NAME=stanfordoval/almond-cloud:latest
./hooks/build
docker push $IMAGE_NAME
./hooks/post_push

export IMAGE_NAME=stanfordoval/almond-cloud:latest-cuda
./hooks/build
docker push $IMAGE_NAME
./hooks/post_push
