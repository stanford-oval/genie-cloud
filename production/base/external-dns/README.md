
### Install external-dns

Kube2iam needs to be installed first as external-dns depends on kube2iam to assign route53 permission
on its pod.

#### Create route53-admin role

Update `${ARN_ROLE}` in `node-trust-policy.json`. `ARN_ROLE` can be obtain using following command

```
CLUSTER_NAME=almond-prod
ARN_ROLE=`aws iam list-instance-profiles | jq -r '.InstanceProfiles[].Roles[].Arn' | grep $CLUSTER_NAME`
```

Then create route53-admin role

```
aws iam create-role \
    --role-name route53-admin \
    --assume-role-policy-document \
    file://node-trust-policy.json

aws iam put-role-policy \
    --role-name route53-admin \
    --policy-name route53  \
    --policy-document file://route53-policy.json

```
### Install external-dns

```
 kubectl create -f external-dns.yaml 
```

