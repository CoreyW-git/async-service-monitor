param(
    [string]$PythonExe = "C:\Users\pipsq\AppData\Local\Programs\Python\Python313\python.exe",
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$WheelhouseDir = "",
    [string]$ImageOutputDir = "",
    [string]$PlaywrightBundleDir = "",
    [string]$AppImageName = "async-service-monitor:offline"
)

$ErrorActionPreference = "Stop"

if (-not $WheelhouseDir) {
    $WheelhouseDir = Join-Path $ProjectRoot "offline\wheelhouse"
}
if (-not $ImageOutputDir) {
    $ImageOutputDir = Join-Path $ProjectRoot "offline\images"
}
if (-not $PlaywrightBundleDir) {
    $PlaywrightBundleDir = Join-Path $ProjectRoot "offline\playwright-browsers"
}

New-Item -ItemType Directory -Force -Path $WheelhouseDir | Out-Null
New-Item -ItemType Directory -Force -Path $ImageOutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $PlaywrightBundleDir | Out-Null

Push-Location $ProjectRoot
try {
    & $PythonExe -m pip install --upgrade pip wheel
    & $PythonExe -m pip wheel . --wheel-dir $WheelhouseDir
    $env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightBundleDir
    & $PythonExe -m playwright install chromium

    docker pull mcr.microsoft.com/playwright/python:v1.53.0-jammy
    docker pull mysql:8.4
    docker pull axllent/mailpit:latest

    docker build -f Dockerfile.offline -t $AppImageName .

    docker save -o (Join-Path $ImageOutputDir "playwright-python-v1.53.0-jammy.tar") mcr.microsoft.com/playwright/python:v1.53.0-jammy
    docker save -o (Join-Path $ImageOutputDir "mysql-8.4.tar") mysql:8.4
    docker save -o (Join-Path $ImageOutputDir "mailpit-latest.tar") axllent/mailpit:latest
    docker save -o (Join-Path $ImageOutputDir "async-service-monitor-offline.tar") $AppImageName

    Write-Host "Offline assets prepared successfully."
    Write-Host "Wheelhouse: $WheelhouseDir"
    Write-Host "Images: $ImageOutputDir"
    Write-Host "Playwright browser bundle: $PlaywrightBundleDir"
}
finally {
    Pop-Location
}
