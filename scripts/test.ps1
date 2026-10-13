# PocketPad Test Script
# Runs frontend TypeScript type checking and all Rust unit/integration tests.

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $RootDir "web"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PocketPad Test Suite                                      " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Ensure Rust is in PATH
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    if (Test-Path $CargoBin) {
        $env:PATH = "$CargoBin;$env:PATH"
    }
}

# 1. Frontend verification
Write-Host "`n[1/2] Verifying Frontend TypeScript and Bundle..." -ForegroundColor Yellow
Push-Location $WebDir
try {
    pnpm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend verification failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
Write-Host "  [OK] Frontend TypeScript check and build passed" -ForegroundColor Green

# 2. Rust test suite
Write-Host "`n[2/2] Running Rust Unit and Integration Tests..." -ForegroundColor Yellow
Push-Location $RootDir
try {
    cargo test
    if ($LASTEXITCODE -ne 0) {
        throw "Rust test suite failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  ALL TESTS PASSED!                                         " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
