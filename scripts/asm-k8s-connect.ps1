# asm-k8s-connect.ps1
# Verifies the async-service-monitor deployment on Docker Desktop Kubernetes.
#
# The app is always reachable at http://localhost (LoadBalancer, no tunnels needed).
# Use WSL2 Ubuntu for all kubectl and Helm operations -- it avoids the Windows
# Schannel TLS issue with Docker Desktop's self-signed Kubernetes cert.
#
# App URL:      http://localhost
# kubectl/helm: wsl -d Ubuntu -- kubectl --context docker-desktop ...
#               wsl -d Ubuntu -- ~/bin/helm --kube-context docker-desktop ...

$chartDir = "/mnt/c/Users/pipsq/OneDrive/Documents/async-service-monitor"

# Verify Docker Desktop Kubernetes is running
Write-Host "Checking cluster..."
$nodes = wsl -d Ubuntu -- kubectl --context docker-desktop get nodes --no-headers 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Desktop Kubernetes is not reachable from WSL2. Ensure Docker Desktop is running with Kubernetes enabled."
    exit 1
}
Write-Host "Cluster: $nodes"

# Show pod status
Write-Host "`nPods:"
wsl -d Ubuntu -- kubectl --context docker-desktop get pods -n async-service-monitor 2>&1

# Verify app is reachable
$health = Invoke-WebRequest -Uri "http://localhost/healthz" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($health -and $health.StatusCode -eq 200) {
    Write-Host "`n==================================================="
    Write-Host "  async-service-monitor is ready!"
    Write-Host "  Open: http://localhost"
    Write-Host "==================================================="
} else {
    Write-Warning "App not reachable at http://localhost. Check pod status above."
}

Write-Host @"

--- Useful commands (run from PowerShell) ---

# View logs:
wsl -d Ubuntu -- kubectl --context docker-desktop logs -n async-service-monitor -l app.kubernetes.io/name=async-service-monitor -f

# Rebuild and redeploy after code changes (must use a unique tag — NOT latest):
# Docker builds go into the 'moby' containerd namespace; Kubernetes uses 'k8s.io'.
# Reusing 'latest' + rollout restart won't pick up new code. Use a unique tag.
`$tag = "dev-`$(Get-Date -Format 'yyyyMMdd-HHmmss')"
docker build -t "async-service-monitor:`$tag" C:\Users\pipsq\OneDrive\Documents\async-service-monitor
wsl -d Ubuntu -- ~/bin/helm --kube-context docker-desktop upgrade async-service-monitor $chartDir/helm/async-service-monitor --namespace async-service-monitor -f $chartDir/helm/async-service-monitor/values-docker-desktop.yaml --set image.tag=`$tag --set env.dockerHost=tcp://host.docker.internal:2375
"@
