# ============================================
# Andy Full Startup Script
# Starts Docker, NanoClaw (WSL), WhatsApp
# Run from PowerShell: .\start-andy.ps1
# ============================================

Write-Host "Starting Andy stack..." -ForegroundColor Cyan

# ── Step 1: Start Docker Desktop if not running ──────────────────────────────
$dockerCheck = docker ps 2>&1
if ($dockerCheck -match "error|cannot|failed") {
    Write-Host "[1/3] Starting Docker Desktop..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Host "      Waiting for Docker to be ready (up to 60s)..."
    $elapsed = 0
    do {
        Start-Sleep -Seconds 3
        $elapsed += 3
        $dockerCheck = docker ps 2>&1
    } while (($dockerCheck -match "error|cannot|failed") -and $elapsed -lt 60)

    if ($dockerCheck -match "error|cannot|failed") {
        Write-Host "[!] Docker didn't start. Open Docker Desktop manually and re-run." -ForegroundColor Red
        exit 1
    }
    Write-Host "      Docker is ready." -ForegroundColor Green
} else {
    Write-Host "[1/3] Docker already running." -ForegroundColor Green
}

# ── Step 2: Start nanoclaw in WSL ────────────────────────────────────────────
Write-Host "[2/3] Starting nanoclaw (Andy) in WSL..." -ForegroundColor Yellow
$status = wsl systemctl --user is-active nanoclaw.service 2>&1
if ($status -match "active") {
    Write-Host "      Already running — restarting for fresh state..." -ForegroundColor Yellow
    wsl systemctl --user restart nanoclaw.service
} else {
    wsl systemctl --user start nanoclaw.service
}
Start-Sleep -Seconds 5

# ── Step 3: Verify WhatsApp connection ───────────────────────────────────────
Write-Host "[3/3] Checking WhatsApp connection..." -ForegroundColor Yellow
$logs = wsl journalctl --user -u nanoclaw.service --no-pager -n 30 2>&1
if ($logs -match "Connected to WhatsApp") {
    Write-Host "      WhatsApp connected." -ForegroundColor Green
} else {
    Write-Host "      Still connecting to WhatsApp..." -ForegroundColor Yellow
}

# ── Status Summary ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Andy is ready!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  How to use: Message YOURSELF on WhatsApp" -ForegroundColor White
Write-Host "  (Saved Messages / self-chat on 918860753300)" -ForegroundColor White
Write-Host "  No trigger word needed - just type anything" -ForegroundColor White
Write-Host ""
Write-Host "  Check logs:  wsl journalctl --user -u nanoclaw.service -f" -ForegroundColor Gray
Write-Host "  Stop Andy:   wsl systemctl --user stop nanoclaw.service" -ForegroundColor Gray
Write-Host "  Restart:     wsl systemctl --user restart nanoclaw.service" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
