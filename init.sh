#!/bin/bash
docker build -t almond-cloud -f ./docker/Dockerfile .

docker run -d --name maria -p 3306:3306 --env-file ./.dev.env mariadb/server:10.4
docker run --rm -p 8080:8080 almond-cloud bootstrap
