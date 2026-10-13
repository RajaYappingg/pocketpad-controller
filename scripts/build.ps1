# PocketPad Build Script
# Builds web assets with PNPM, then compiles the standalone Windows x64 release executable.

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $RootDir "web"
$HostDir = Join-Path $RootDir "host"
$BinDir = Join-Path $RootDir "bin"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Building PocketPad (Frontend + Standalone Windows Host)   " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Ensure Rust is in PATH
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    if (Test-Path $CargoBin) {
        $env:PATH = "$CargoBin;$env:PATH"
    } else {
        Write-Error "Cargo was not found in PATH or at $CargoBin. Please install Rust first."
    }
}

# 1. Build Web Frontend
Write-Host "`n[1/3] Building Web Frontend with PNPM..." -ForegroundColor Yellow
Push-Location $WebDir
try {
    pnpm install
    pnpm build
} finally {
    Pop-Location
}

if (-not (Test-Path (Join-Path $WebDir "dist\index.html"))) {
    Write-Error "Frontend build failed: dist/index.html not found."
}
Write-Host "  [OK] Frontend built successfully into web/dist" -ForegroundColor Green

# 2. Build Rust Standalone Executable (Release with LTO and Stripped Symbols)
Write-Host "`n[2/3] Building Optimized Windows x64 Host..." -ForegroundColor Yellow
Push-Location $RootDir
try {
    cargo build --release --bin pocketpad
} finally {
    Pop-Location
}

# 3. Copy to bin/ directory for easy distribution
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

$SourceExe = Join-Path $RootDir "target\release\pocketpad.exe"
$DestExe = Join-Path $BinDir "pocketpad.exe"

Copy-Item -Path $SourceExe -Destination $DestExe -Force
$ExeSize = (Get-Item $DestExe).Length / 1MB

Write-Host "`n[3/3] Build Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Output Binary : $DestExe" -ForegroundColor White
Write-Host "  Binary Size   : $([math]::Round($ExeSize, 2)) MB (Self-contained, includes web UI)" -ForegroundColor White
Write-Host "  Ready to run! Double click or launch bin\pocketpad.exe" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
