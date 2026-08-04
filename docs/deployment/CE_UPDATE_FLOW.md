# Community Update Flow

Community production users should update through exact release artifacts and
prebuilt images. Production VPS hosts must not build Go or frontend source.

Required flow:

```text
check target version
  -> validate release metadata
  -> backup database and configuration
  -> pull exact Docker image tags
  -> run migration once
  -> recreate services
  -> run health checks
  -> mark version active
  -> rollback on failure
```

The current `deploy/upgrade.sh` still contains compatibility paths for Git or
source tarball updates. Those paths are legacy and should be removed before
claiming the CE updater is fully hardened.
