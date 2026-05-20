# deploy.ps1 — run from monorepo root
# Usage: .\deploy.ps1

Write-Host "Deploying Auris..." -ForegroundColor Cyan

# 1. Run tests first
Write-Host "
[1/4] Running tests..." -ForegroundColor Yellow
python infra/setup/test.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Tests failed. Aborting deploy." -ForegroundColor Red
    exit 1
}

# 2. Deploy backend
Write-Host "
[2/4] Deploying backend..." -ForegroundColor Yellow
scp server/routes/*.py retailiq-server:/home/retailiq-key/auris-server/routes/
scp server/aggregator/*.py retailiq-server:/home/retailiq-key/auris-server/aggregator/
scp server/main.py retailiq-server:/home/retailiq-key/auris-server/
scp server/db.py retailiq-server:/home/retailiq-key/auris-server/
ssh retailiq-server "sudo systemctl restart auris"
Write-Host "Backend deployed." -ForegroundColor Green

# 3. Deploy HQ portal
Write-Host "
[3/4] Building and deploying HQ portal..." -ForegroundColor Yellow
Set-Location dashboard\auris-hq
npm run build
Set-Location ..\..
scp -r dashboard\auris-hq\dist\* retailiq-server:/var/www/auris-hq/
Write-Host "HQ portal deployed." -ForegroundColor Green

# 4. Deploy client portal
Write-Host "
[4/4] Building and deploying client portal..." -ForegroundColor Yellow
Set-Location dashboard
npx expo export --platform web
Set-Location ..
scp -r dashboard\dist\* retailiq-server:/var/www/auris/
Write-Host "Client portal deployed." -ForegroundColor Green

Write-Host "
Done. Auris is live." -ForegroundColor Cyan
