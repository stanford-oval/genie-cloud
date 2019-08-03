### Install helm 

Download helm form https://helm.sh/docs/using_helm/

```
kubectl create -f rbac-config.yaml
helm init --service-account tiller --history-max 200 --upgrade

```

### Install kube2iam

```
helm install --name iam \
    --namespace kube-system \
    -f values-kube2iam.yaml  \
    stable/kube2iam

```

Assign role policy for pods.  ARN and ROLE can be found from following command:

```
CLUSTER_NAME=almond-prod
ARN=`aws iam list-instance-profiles | jq -r '.InstanceProfiles[].Roles[].Arn' | grep $CLUSTER_NAME  | sed -e s/:role.*//`
ROLE=`aws iam list-instance-profiles | jq -r '.InstanceProfiles[].Roles[].Arn' | grep $CLUSTER_NAME   | cut -f6 -d':'`
```

Update ${ARN} in `kube2iam-policy.json`  and run

```
aws iam put-role-policy \
    --role-name $ROLE \
    --policy-name kube2iam  \
    --policy-document file://kube2iam-policy.json

```
