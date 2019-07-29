set -exuo pipefail

eksctl create cluster \
	--name training-prod \
	--version 1.13 \
	--nodegroup-name cpu-workers \
	--node-type t3.medium \
	--nodes 1 \
	--nodes-min 0 \
	--nodes-max 1 \
	--node-ami auto \
	--vpc-private-subnets subnet-6578be01,subnet-e3776d94 \
	--vpc-public-subnets subnet-b1be88e8,subnet-08177246d36e9c1b2

eksctl create nodegroup \
	--cluster training-prod \
	-n gpu-workers -t p2.xlarge -N 1 -m 0 -M 4
