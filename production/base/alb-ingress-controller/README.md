## Install ingress controller

Ingress controller manages external http[s] traffic to k8 cluster service using
ALB. It depends on kube2iam to for aim role assign and external-dns to configure
dns using route53.

#### Create iam role

Update `${ARN_ROLE}` in `node-trust-policy.json`. `ARN_ROLE` can be obtain using following command

```
CLUSTER_NAME=almond-prod
ARN_ROLE=`aws iam list-instance-profiles | jq -r '.InstanceProfiles[].Roles[].Arn' | grep $CLUSTER_NAME`
```

Then create the role and attach the policy, which is from:

  https://github.com/kubernetes-sigs/aws-alb-ingress-controller/blob/master/docs/examples/iam-policy.json

```
aws iam create-role \
    --role-name almond-ingress-controller \
    --assume-role-policy-document \
    file://node-trust-policy.json

aws iam put-role-policy \
    --role-name almond-ingress-controller \
    --policy-name almond-ingress-controller-policy  \
    --policy-document file://aim-policy.json
```

#### Install ingress controller

```
kubectl create -f rbac-role.yaml
kubectl create -f alb-ingress-controller.yaml
```
