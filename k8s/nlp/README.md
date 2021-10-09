You can deploy the NLP server locally to test STT and TTS calls --

1.  Add this lint to `k8s/dev/kustomization.yaml:components`

        - ../nlp/dev

2.  Add these to your `k8s/config/dev/config.yaml`:

        NL_EXACT_MATCH_DIR: s3://geniehai/almond-cloud/staging/exact
        MS_SPEECH_SERVICE_REGION: westus2
    
3.  Add an `MS_SPEECH_SUBSCRIPTION_KEY` to your `k8s/config/dev/secret.yaml`
4.  Create an AWS IAM account that has read access to S3
5.  Add a `k8s/nlp/dev/deployment.local.yaml` file, replacing the token and
    secret values with those of that IAM account:
    
    ```yaml
    ---
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: nlp
    spec:
      template:
        spec:
          containers:
            - name: nlp
              env:
                # nrser.local.almond-cloud service account credentials
                - name: AWS_ACCESS_KEY_ID
                  value: <ACCESS-TOKEN>
                - name: AWS_SECRET_ACCESS_KEY
                  value: <SECRET-KEY>
          volumes:
            - name: src
              hostPath:
                path: /Users/nrser/src/github.com/stanford-oval/almond-cloud/src
            - name: views
              hostPath:
                path: /Users/nrser/src/github.com/stanford-oval/almond-cloud/views
            - name: shared
              hostPath:
                path: /Users/nrser/src/github.com/stanford-oval/almond-cloud/tmp/shared
    ```
    
6.  Use a local DNS server that routes *.test to 127.0.0.1
7.  Configure your NLP URL to be
    
    http://nlp.almond-cloud.test:8080
