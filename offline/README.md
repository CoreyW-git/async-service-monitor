# Offline Assets

This folder is where air-gapped build assets live.

Expected contents:

- `wheelhouse/`
  - Python wheels for `async-service-monitor` and every dependency
- `images/`
  - `python-3.12-slim.tar`
  - `async-service-monitor-offline.tar`
  - `mysql-8.4.tar`
  - `mailpit-latest.tar`

Use the PowerShell scripts in `scripts/` from a connected machine to populate these assets before moving the project into an offline environment.
