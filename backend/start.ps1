param([switch]$SkipInstall)

Write-Host "Starting FaithConnect backend (fast start)" -ForegroundColor Cyan

if (-not $SkipInstall -and -not (Test-Path "node_modules")) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
  npm install
}

if (-not (Test-Path ".env")) {
  Write-Host "Creating default .env..." -ForegroundColor Yellow
  @"
DATABASE_URL="file:./prisma/data/dev.db"
PORT=4000
JWT_SECRET="changeme-super-secret-key"
BACKUP_DIR="backend/prisma/backups"
BACKUP_INTERVAL_MINUTES=60
"@ | Set-Content ".env"
}

Write-Host "Applying Prisma migrations..." -ForegroundColor Yellow
npx prisma migrate dev

Write-Host "Starting backend dev server on http://localhost:4000 ..." -ForegroundColor Green
npm run dev
