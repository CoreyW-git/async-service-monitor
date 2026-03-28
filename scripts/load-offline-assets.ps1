param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$ImageInputDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $ImageInputDir) {
    $ImageInputDir = Join-Path $ProjectRoot "offline\images"
}

$required = @(
    "playwright-python-v1.53.0-jammy.tar",
    "mysql-8.4.tar",
    "mailpit-latest.tar",
    "async-service-monitor-offline.tar"
)

foreach ($file in $required) {
    $path = Join-Path $ImageInputDir $file
    if (-not (Test-Path $path)) {
        throw "Missing offline image asset: $path"
    }
    docker load -i $path
}

Write-Host "Offline Docker images loaded successfully from $ImageInputDir"
