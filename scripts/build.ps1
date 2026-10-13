# PocketPad Build Script
# Builds web assets with PNPM, then compiles the standalone Windows x64 release executable.
param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$NoClean
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $RootDir "web"
$BinDir = Join-Path $RootDir "bin"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Building PocketPad (Frontend + Standalone Windows Host)   " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "  cargo   : $(try { cargo --version } catch { 'NOT FOUND' })" -ForegroundColor DarkGray
Write-Host "  node    : $(try { node --version } catch { 'NOT FOUND' })" -ForegroundColor DarkGray
Write-Host "  pnpm    : $(try { pnpm --version } catch { 'NOT FOUND' })" -ForegroundColor DarkGray

function Assert-NativeOk([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE."
    }
}

function Assert-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found in PATH. $Hint"
    }
}

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
if (-not $SkipFrontend) {
    Write-Host "`n[1/3] Building Web Frontend with PNPM..." -ForegroundColor Yellow
    Assert-Command "pnpm" "Install Node 18+ then run: corepack enable"
    Assert-Command "node" "Install Node 18+."
    Push-Location $WebDir
    try {
        pnpm install --frozen-lockfile
        Assert-NativeOk "pnpm install"
        pnpm build
        Assert-NativeOk "pnpm build"
    } finally {
        Pop-Location
    }

    if (-not (Test-Path (Join-Path $WebDir "dist\index.html"))) {
        Write-Error "Frontend build failed: dist/index.html not found."
    }
    Write-Host "  [OK] Frontend built successfully into web/dist" -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Skipping frontend (-SkipFrontend)" -ForegroundColor DarkGray
    if (-not (Test-Path (Join-Path $WebDir "dist\index.html"))) {
        throw "Cannot skip frontend: web/dist/index.html is missing. Build once without -SkipFrontend."
    }
}

# 2. Build Rust Standalone Executable (Release with LTO and Stripped Symbols)
if (-not $SkipBackend) {
    Write-Host "`n[2/3] Building Optimized Windows x64 Host..." -ForegroundColor Yellow
    Push-Location $RootDir
    try {
        if (-not $NoClean) {
            cargo clean -p pocketpad
            Assert-NativeOk "cargo clean -p pocketpad"
        }
        cargo build --locked --release --bin pocketpad
        Assert-NativeOk "cargo build --release"
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[2/3] Skipping backend (-SkipBackend)" -ForegroundColor DarkGray
}

# 3. Copy to bin/ directory for easy distribution
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

$SourceExe = Join-Path $RootDir "target\release\pocketpad.exe"
$DestExe = Join-Path $BinDir "pocketpad.exe"

if (-not (Test-Path $SourceExe)) {
    throw "Backend build output not found at $SourceExe. Run without -SkipBackend first."
}

$running = Get-Process -Name pocketpad -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Stopping running pocketpad process to update binary..." -ForegroundColor Yellow
    Stop-Process -Name pocketpad -Force -ErrorAction SilentlyContinue
}

# Retry copy: AV/file locks often hold the exe for >300ms.
$copied = $false
for ($i = 1; $i -le 5 -and -not $copied; $i++) {
    try {
        Copy-Item -Path $SourceExe -Destination $DestExe -Force -ErrorAction Stop
        $copied = $true
    } catch {
        if ($i -eq 5) { throw "Copy to $DestExe failed after 5 attempts: $_" }
        Start-Sleep -Milliseconds (200 * $i)
    }
}
$ExeSize = (Get-Item $DestExe).Length / 1MB
$Hash = (Get-FileHash -Path $DestExe -Algorithm SHA256).Hash

Write-Host "`n[3/3] Build Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Output Binary : $DestExe" -ForegroundColor White
Write-Host "  Binary Size   : $([math]::Round($ExeSize, 2)) MB (Self-contained, includes web UI)" -ForegroundColor White
Write-Host "  SHA256        : $Hash" -ForegroundColor White
Write-Host "  Ready to run! Double click or launch bin\pocketpad.exe" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
