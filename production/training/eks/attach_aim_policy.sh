set -exuo pipefail

export REGION=us-west-2
export ALB_POLICY_ARN=`aws iam list-policies | grep policy/ingressController-iam-policy  | cut -f4 -d '"'`
ROLES=`aws iam list-roles | grep RoleName | grep prod-nodegroup | cut -f4 -d '"'`
for NODE_ROLE_NAME in $ROLES; do
  aws iam attach-role-policy --region=$REGION --role-name=$NODE_ROLE_NAME --policy-arn=$ALB_POLICY_ARN
done
