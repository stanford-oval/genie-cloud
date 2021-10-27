#!/bin/bash

exec kubectl -n almond-dev run --restart=Never --rm -ti --image mariadb:10.2.22 --command mariadb -- mysql -hdb -ppassword -Dthingengine_dev --default-character-set=utf8mb4
