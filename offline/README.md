# Offline Assets

This folder is where air-gapped build assets live.

Expected contents:

- `wheelhouse/`
  - Python wheels for `async-service-monitor` and every dependency
- `images/`
  - `playwright-python-v1.53.0-jammy.tar`
  - `async-service-monitor-offline.tar`
  - `postgres-17-alpine.tar`
  - `minio-release-2025-02-28.tar`
  - `mailpit-latest.tar`

Use the PowerShell scripts in `scripts/` from a connected machine to populate these assets before moving the project into an offline environment.
