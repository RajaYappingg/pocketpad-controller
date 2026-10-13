# PocketPad Test Script
# Fast frontend type check + full Rust unit/integration tests + lints.

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

function Invoke-Native([string]$Label, [scriptblock]$Cmd) {
    Write-Host "`n$Label" -ForegroundColor Yellow
    & $Cmd
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

# 1. Frontend type check (fast, no emit)
Push-Location $WebDir
try {
    Invoke-Native "[1/5] Type-checking web (tsc --noEmit)" { pnpm exec tsc --noEmit }
    Invoke-Native "[2/5] Web protocol tests (vitest)" { pnpm exec vitest run }
} finally {
    Pop-Location
}

# 2. Rust tests (locked deps, all targets)
Push-Location $RootDir
try {
    Invoke-Native "[3/5] Running Rust tests" { cargo test --locked --all-targets }
    Invoke-Native "[4/5] Clippy (deny warnings)" { cargo clippy --locked --all-targets -- -D warnings }
    Invoke-Native "[5/5] rustfmt check" { cargo fmt --check }
} finally {
    Pop-Location
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  ALL TESTS PASSED!                                         " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
