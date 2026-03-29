# Kubernetes Deployment

This directory contains Kustomize-ready manifests for running `async-service-monitor` in Kubernetes.

## Layout

- `base/`: shared deployment, service, probe, and config wiring
- `overlays/oke/`: Oracle Kubernetes Engine public load balancer settings
- `overlays/eks/`: Amazon EKS Network Load Balancer settings
- `overlays/aks/`: Azure Kubernetes Service public load balancer settings

## Before You Deploy

1. Build and push your image to a registry your cluster can pull from.
2. Update the image reference in the overlay you plan to use:

```powershell
cd kubernetes\overlays\eks
kustomize edit set image async-service-monitor=<registry>/async-service-monitor:<tag>
```

3. Review and customize `config.kubernetes.yaml`.
4. If the config file contains encrypted values, create a secret with `ASM_CONFIG_PASSPHRASE`:

```powershell
kubectl create secret generic async-service-monitor-secrets `
  --from-literal=ASM_CONFIG_PASSPHRASE=<your-passphrase> `
  --namespace async-service-monitor
```

## Deploy

```powershell
kubectl apply -k kubernetes\overlays\eks
```

Replace `eks` with `oke` or `aks` as needed.

## Operational Notes

- The Kubernetes deployment is intentionally a single control-plane replica by default.
- The in-app Docker container management workflows are for Docker-based deployments. In Kubernetes, scaling and lifecycle should be handled by Deployments, Services, and your cluster tooling.
- The deployment uses `/livez`, `/readyz`, and `/healthz` for probes.
