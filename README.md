# Async Service Monitor

`async-service-monitor` is a Python monitoring platform for endpoint health, peer monitor coordination, Docker-based recovery, live administration, and short-retention telemetry storage.

## At A Glance

| Area | What It Does |
| --- | --- |
| Endpoint Monitoring | HTTP, DNS, and auth-aware checks with content validation |
| Admin Portal | Dashboard, dedicated monitor pages, FAQ, profile, and service configuration |
| Cluster Monitoring | Peer health polling, failover ownership, and recovery decisions |
| Container Ops | Start, stop, restart, and create monitor containers live |
| Access Control | Read-only, read-write, and admin portal accounts |
| Telemetry Storage | Optional 2-hour MySQL retention for monitor results, node health, and config snapshots |

## Architecture

### Core Flow

```mermaid
flowchart LR
    A["Admin Portal"] --> B["Config Store"]
    B --> C["Monitor Runner"]
    C --> D["Endpoint Checks"]
    C --> E["Peer Polling"]
    D --> F["Live Dashboard State"]
    E --> F
    F --> G["Optional MySQL Telemetry"]
```

### Cluster Behavior

```mermaid
flowchart TD
    A["Monitor Node A"] --> D["Shared Endpoint Targets"]
    B["Monitor Node B"] --> D
    C["Monitor Node C"] --> D
    A --> E["Peer Health Checks"]
    B --> E
    C --> E
    E --> F["Failover + Recovery"]
    F --> G["Email Notifications"]
```

### Telemetry Retention

```mermaid
flowchart LR
    A["Check Result"] --> B["MonitorState"]
    B --> C["Dashboard Graphs"]
    B --> D["Telemetry Store"]
    D --> E["Local MySQL"]
    D --> F["OCI MySQL"]
```

## Main Portal Areas

### FAQ

- Visual service-flow diagrams
- Answers for monitoring, scaling, auth, and telemetry storage

### Dashboard

- Endpoint health dots
- Live availability graphs
- Node-health graphs
- Last-fired timestamps and latest result summaries

### Monitor Pages

- One page per monitor
- Edit targets, timing, validation, and auth settings
- Enable, disable, and delete checks

### Containers

- Manage peer monitor definitions
- Control monitor containers
- Add new monitor containers live

### Administration

- User and role management
- Service configuration for telemetry and OCI auth scaffolding
- Self-service local MySQL provisioning for telemetry storage

## Telemetry Storage

Telemetry storage is optional and can retain up to 2 hours of:

- endpoint monitor results
- node heartbeat history
- configuration snapshots

You can point telemetry at:

1. A local MySQL instance
2. An OCI-hosted MySQL instance

If you select local MySQL in the admin portal, you can also enable self-service provisioning. In that mode the service will attempt to start a local MySQL Docker container for you using `mysql:8.4`, then persist the generated connection details back into the config.

Assumption:
This self-service local setup expects Docker Engine to be available on the machine running the admin portal.

## Running Locally

```powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
py -3 -m service_monitor --config config.yaml
```

Open [http://localhost:8000](http://localhost:8000).

## Running With Docker

```powershell
docker build -t async-service-monitor .
docker run --rm -p 8000:8000 -v ${PWD}/config.yaml:/app/config.yaml async-service-monitor
```

## Offline-Friendly Deployment

This repo now includes an offline build and deployment path, but there is one important distinction:

- The repo is now structured for air-gapped deployment.
- The actual offline assets still need to be prepared once from a connected machine.

Offline assets live under:

- `offline/wheelhouse/`
- `offline/images/`

### What Must Be Prepared Before Going Offline

From a connected machine, prepare:

1. Python wheels for the app and every dependency
2. Docker image tar files for:
   - `python:3.12-slim`
   - `async-service-monitor:offline`
   - `mysql:8.4`
   - `axllent/mailpit:latest`

### Prepare Offline Assets

```powershell
.\scripts\prepare-offline-assets.ps1
```

That script will:

- build a local wheelhouse into `offline/wheelhouse`
- pull the required base/support images
- build the offline app image with [Dockerfile.offline](C:\Users\pipsq\OneDrive\Documents\async-service-monitor\Dockerfile.offline)
- export image tar files into `offline/images`

### Verify Offline Assets

```powershell
.\scripts\verify-offline-assets.ps1
```

### Build The Offline Image

Once `offline/wheelhouse` has been populated, the image can be rebuilt without internet access as long as the base image is already loaded locally:

```powershell
docker build -f Dockerfile.offline -t async-service-monitor:offline .
```

### Load Prebuilt Offline Images In An Air-Gapped Environment

```powershell
.\scripts\load-offline-assets.ps1
```

### Run Offline

```powershell
docker run --rm -p 8000:8000 -v ${PWD}/config.yaml:/app/config.yaml async-service-monitor:offline
```

### Run Offline With Compose

```powershell
docker compose -f docker-compose.offline.yml up
```

### Air-Gap Notes

- Local self-provisioned MySQL still expects `mysql:8.4` to already be loaded into Docker.
- Local self-provisioned Mailpit still expects `axllent/mailpit:latest` to already be loaded into Docker.
- If you plan to use OCI MySQL or external email providers in an offline environment, those endpoints still need network reachability from that environment.

## Clustered Compose

```powershell
docker compose up --build
```

## Key Files

- `src/service_monitor/admin.py`
- `src/service_monitor/auth.py`
- `src/service_monitor/runner.py`
- `src/service_monitor/cluster.py`
- `src/service_monitor/config.py`
- `src/service_monitor/config_store.py`
- `src/service_monitor/telemetry.py`
- `src/service_monitor/web/index.html`
- `src/service_monitor/web/app.css`
- `src/service_monitor/web/app.js`
- `Dockerfile.offline`
- `docker-compose.offline.yml`
- `scripts/prepare-offline-assets.ps1`
- `scripts/load-offline-assets.ps1`
- `scripts/verify-offline-assets.ps1`

## Notes

- Monitor config edits are written back to the YAML file.
- Updated monitors re-run immediately after save.
- The portal uses session-based login today and includes OCI auth scaffolding for future integration.
- Local MySQL self-provisioning uses Docker and is intended to reduce manual setup when telemetry storage is enabled.
- Offline deployment support now exists, but the required wheelhouse and image tar files must still be generated once on a connected machine before moving into a disconnected environment.
