param([switch]$SkipInstall)

Write-Host "Starting FaithConnect frontend (fast start)" -ForegroundColor Cyan

if (-not $SkipInstall -and -not (Test-Path "node_modules")) {
  Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
  npm install
}

if (-not (Test-Path ".env")) {
  Write-Host "Creating default .env ..." -ForegroundColor Yellow
  @"
VITE_API_BASE_URL=http://localhost:4000
"@ | Set-Content ".env"
}

Write-Host "Starting frontend dev server on http://localhost:5173/ ..." -ForegroundColor Green
npm run dev
