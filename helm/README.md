# Helm Deployment

This folder contains a Helm chart for deploying `async-service-monitor` to Kubernetes.

## Chart Location

- `helm/async-service-monitor`

## Install

Generic install:

```powershell
helm upgrade --install async-service-monitor .\helm\async-service-monitor `
  --namespace async-service-monitor `
  --create-namespace `
  --set image.repository=<registry>/async-service-monitor `
  --set image.tag=<tag>
```

If you use encrypted config values, create the passphrase secret first:

```powershell
kubectl create secret generic async-service-monitor-secrets `
  --from-literal=ASM_CONFIG_PASSPHRASE=<your-passphrase> `
  --namespace async-service-monitor
```

## Cloud Provider Presets

OKE:

```powershell
helm upgrade --install async-service-monitor .\helm\async-service-monitor `
  --namespace async-service-monitor `
  --create-namespace `
  -f .\helm\async-service-monitor\values-oke.yaml `
  --set image.repository=<registry>/async-service-monitor `
  --set image.tag=<tag>
```

EKS:

```powershell
helm upgrade --install async-service-monitor .\helm\async-service-monitor `
  --namespace async-service-monitor `
  --create-namespace `
  -f .\helm\async-service-monitor\values-eks.yaml `
  --set image.repository=<registry>/async-service-monitor `
  --set image.tag=<tag>
```

AKS:

```powershell
helm upgrade --install async-service-monitor .\helm\async-service-monitor `
  --namespace async-service-monitor `
  --create-namespace `
  -f .\helm\async-service-monitor\values-aks.yaml `
  --set image.repository=<registry>/async-service-monitor `
  --set image.tag=<tag>
```

## Notes

- The chart defaults to a single control-plane replica.
- Provider-specific load balancer behavior is selected through `cloud.provider` or the included provider values files.
- The config file is embedded in the chart values by default and mounted as a ConfigMap.

## Ingress And TLS

The chart can also publish the service through a Kubernetes `Ingress` instead of relying only on a `LoadBalancer` service.

Example:

```powershell
helm upgrade --install async-service-monitor .\helm\async-service-monitor `
  --namespace async-service-monitor `
  --create-namespace `
  --set image.repository=<registry>/async-service-monitor `
  --set image.tag=<tag> `
  --set service.type=ClusterIP `
  --set ingress.enabled=true `
  --set ingress.className=nginx `
  --set ingress.hosts[0].host=monitor.example.com `
  --set ingress.tls[0].secretName=async-service-monitor-tls `
  --set ingress.tls[0].hosts[0]=monitor.example.com
```

## Autoscaling

The chart includes an optional Horizontal Pod Autoscaler.

Example:

```powershell
helm upgrade --install async-service-monitor .\helm\async-service-monitor `
  --namespace async-service-monitor `
  --create-namespace `
  --set image.repository=<registry>/async-service-monitor `
  --set image.tag=<tag> `
  --set autoscaling.enabled=true `
  --set autoscaling.minReplicas=2 `
  --set autoscaling.maxReplicas=5
```

When autoscaling is enabled, the chart omits the fixed Deployment replica count and lets the HPA manage it.
