param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$wheelhouse = Join-Path $ProjectRoot "offline\wheelhouse"
$images = Join-Path $ProjectRoot "offline\images"

if (-not (Test-Path $wheelhouse)) {
    throw "Missing wheelhouse directory: $wheelhouse"
}
if (-not (Test-Path $images)) {
    throw "Missing offline images directory: $images"
}

$appWheel = Get-ChildItem -Path $wheelhouse -Filter "async_service_monitor-*.whl" -ErrorAction Stop | Select-Object -First 1
if (-not $appWheel) {
    throw "Missing project wheel in $wheelhouse"
}

$requiredImages = @(
    "python-3.12-slim.tar",
    "mysql-8.4.tar",
    "mailpit-latest.tar",
    "async-service-monitor-offline.tar"
)

foreach ($image in $requiredImages) {
    $path = Join-Path $images $image
    if (-not (Test-Path $path)) {
        throw "Missing offline image tar: $path"
    }
}

Write-Host "Offline asset verification passed."
Write-Host "Project wheel: $($appWheel.FullName)"
