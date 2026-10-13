# PocketPad Dev Runner Script
# Builds frontend assets and launches the PocketPad Windows host with live console output.

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $RootDir "web"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting PocketPad in Development Mode                    " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Ensure Rust is in PATH
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    if (Test-Path $CargoBin) {
        $env:PATH = "$CargoBin;$env:PATH"
    }
}

# 1. Build frontend if needed
if (-not (Test-Path (Join-Path $WebDir "dist\index.html"))) {
    Write-Host "Building web frontend..." -ForegroundColor Yellow
    Push-Location $WebDir
    try {
        pnpm build
    } finally {
        Pop-Location
    }
}

# 2. Run Rust host
Write-Host "Launching PocketPad host on port 3000..." -ForegroundColor Green
Push-Location $RootDir
try {
    cargo run --bin pocketpad
} finally {
    Pop-Location
}
