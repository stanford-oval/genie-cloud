Resolve Host Paths Transformer (Kustomize Exec Plugin)
============================================================================

Transforms `spec.template.spec.volumes[*].hostPath.path` that start with `//`
to be relative to the repository root on the host file system.

Motivation
----------------------------------------------------------------------------

At least Docker Desktop seems to need _absolute_ paths when mounting host
directories, but the absolute path to the repo root usually differs between
developers.

This transformer allows specifying repo-relative paths with a special `//`
prefix, and resolving those durning `kustomize build`, removing the need (in
this case) for the previous pre-build step and associated `.local.yaml` files.

Example
----------------------------------------------------------------------------

When `almond-cloud` is cloned at

    /home/aladin/src/github.com/stanford-oval/almond-cloud

then resources that contain the following structure

```yaml
spec:
  template:
    spec:
      volumes:
        - name: src
          hostPath:
            path: //src
```

will be transformed into:

```yaml
spec:
  template:
    spec:
      volumes:
        - name: src
          hostPath:
            path: /home/aladdin/src/github.com/stanford-oval/almond-cloud/src
```

Contributors
------------------------------------------------------------------------------

-   Neil Souza <neil@neilsouza.com>
