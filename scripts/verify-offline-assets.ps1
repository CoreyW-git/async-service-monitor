param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$wheelhouse = Join-Path $ProjectRoot "offline\wheelhouse"
$images = Join-Path $ProjectRoot "offline\images"
$playwrightBrowsers = Join-Path $ProjectRoot "offline\playwright-browsers"

if (-not (Test-Path $wheelhouse)) {
    throw "Missing wheelhouse directory: $wheelhouse"
}
if (-not (Test-Path $images)) {
    throw "Missing offline images directory: $images"
}
if (-not (Test-Path $playwrightBrowsers)) {
    throw "Missing Playwright browser bundle directory: $playwrightBrowsers"
}

$appWheel = Get-ChildItem -Path $wheelhouse -Filter "async_service_monitor-*.whl" -ErrorAction Stop | Select-Object -First 1
if (-not $appWheel) {
    throw "Missing project wheel in $wheelhouse"
}

$requiredImages = @(
    "playwright-python-v1.53.0-jammy.tar",
    "postgres-17-alpine.tar",
    "minio-release-2025-02-28.tar",
    "mailpit-latest.tar",
    "async-service-monitor-offline.tar"
)

foreach ($image in $requiredImages) {
    $path = Join-Path $images $image
    if (-not (Test-Path $path)) {
        throw "Missing offline image tar: $path"
    }
}

$chromiumBundle = Get-ChildItem -Path $playwrightBrowsers -Recurse -ErrorAction Stop | Select-Object -First 1
if (-not $chromiumBundle) {
    throw "Missing Playwright browser payload under $playwrightBrowsers"
}

Write-Host "Offline asset verification passed."
Write-Host "Project wheel: $($appWheel.FullName)"
Write-Host "Playwright bundle root: $playwrightBrowsers"
