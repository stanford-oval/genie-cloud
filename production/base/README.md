# One time setup

See the README in subdirectories on how to install other module.


#### Create aws cluster

```
eksctl create cluster \
	--name almond-prod \
	--version 1.13 \
	--nodegroup-name large-cpu-workers \
	--node-type c5.2xlarge \
	--nodes 1 \
	--nodes-min 0 \
	--nodes-max 1 \
        --node-volume-size 100 \
	--node-ami auto \
	--vpc-private-subnets subnet-6578be01,subnet-e3776d94 \
	--vpc-public-subnets subnet-b1be88e8,subnet-08177246d36e9c1b2
```

#### Create gpu node group

```
eksctl create nodegroup \
	--cluster almond-prod \
	-n gpu-workers -t p2.xlarge -N 1 -m 0 -M 1 --node-volume-size 100

```

#### Login to ecr

```
 aws ecr get-login --no-include-email `
```


#### Create AWS ECR repository

```
aws ecr create-repository --repository-name almond/base --region us-west-2
aws ecr create-repository --repository-name almond/training --region us-west-2
aws ecr create-repository --repository-name almond/nlp --region us-west-2
aws ecr create-repository --repository-name almond/tokenizer --region us-west-2
```

### Updates default namespace image pull secret for aws ecr

```
AWS_ACCOUNT=123456789000
AWS_REGION=us-west-2
DOCKER_REGISTRY_SERVER=https://${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com
DOCKER_USER=AWS
DOCKER_PASSWORD=`aws ecr get-login --region ${AWS_REGION} --registry-ids ${AWS_ACCOUNT} | cut -d' ' -f6`
kubectl delete secret aws-registry || true
kubectl create secret docker-registry aws-registry \
  --docker-server=$DOCKER_REGISTRY_SERVER \
  --docker-username=$DOCKER_USER \
  --docker-password=$DOCKER_PASSWORD \
  --docker-email=no@ema.il
kubectl patch serviceaccount default -p '{"imagePullSecrets":[{"name":"aws-registry"}]}'
```
