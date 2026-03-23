param(
    [string]$PythonExe = "C:\Users\pipsq\AppData\Local\Programs\Python\Python313\python.exe",
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$WheelhouseDir = "",
    [string]$ImageOutputDir = "",
    [string]$AppImageName = "async-service-monitor:offline"
)

$ErrorActionPreference = "Stop"

if (-not $WheelhouseDir) {
    $WheelhouseDir = Join-Path $ProjectRoot "offline\wheelhouse"
}
if (-not $ImageOutputDir) {
    $ImageOutputDir = Join-Path $ProjectRoot "offline\images"
}

New-Item -ItemType Directory -Force -Path $WheelhouseDir | Out-Null
New-Item -ItemType Directory -Force -Path $ImageOutputDir | Out-Null

Push-Location $ProjectRoot
try {
    & $PythonExe -m pip install --upgrade pip wheel
    & $PythonExe -m pip wheel . --wheel-dir $WheelhouseDir

    docker pull python:3.12-slim
    docker pull mysql:8.4
    docker pull axllent/mailpit:latest

    docker build -f Dockerfile.offline -t $AppImageName .

    docker save -o (Join-Path $ImageOutputDir "python-3.12-slim.tar") python:3.12-slim
    docker save -o (Join-Path $ImageOutputDir "mysql-8.4.tar") mysql:8.4
    docker save -o (Join-Path $ImageOutputDir "mailpit-latest.tar") axllent/mailpit:latest
    docker save -o (Join-Path $ImageOutputDir "async-service-monitor-offline.tar") $AppImageName

    Write-Host "Offline assets prepared successfully."
    Write-Host "Wheelhouse: $WheelhouseDir"
    Write-Host "Images: $ImageOutputDir"
}
finally {
    Pop-Location
}
