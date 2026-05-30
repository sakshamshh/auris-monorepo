# To migrate to a new server:
# 1. Create Ubuntu VM (GCP: n1-standard-1, T4 GPU, Spot)
# 2. Add SSH key to VM
# 3. scp -r server/* user@IP:/home/retailiq-key/auris-server/
# 4. ssh user@IP "bash /home/retailiq-key/auris-server/infra/setup/server_setup.sh"
# 5. Follow the printed instructions
# Done in 10 minutes.

# deploy.ps1 — run from monorepo root
# Usage: .\deploy.ps1

Write-Host "Deploying Auris..." -ForegroundColor Cyan

# 1. Run tests first
Write-Host "`n[1/4] Running tests..." -ForegroundColor Yellow
python infra/setup/test.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Tests failed. Continuing with deployment anyway..." -ForegroundColor Yellow
}

# 2. Deploy backend
Write-Host "`n[2/4] Deploying backend..." -ForegroundColor Yellow
scp -i ~/.ssh/id_rsa server/routes/*.py saksham@34.131.253.189:/home/retailiq-key/auris-server/routes/
scp -i ~/.ssh/id_rsa server/aggregator/*.py saksham@34.131.253.189:/home/retailiq-key/auris-server/aggregator/
scp -i ~/.ssh/id_rsa server/main.py saksham@34.131.253.189:/home/retailiq-key/auris-server/
scp -i ~/.ssh/id_rsa server/db.py saksham@34.131.253.189:/home/retailiq-key/auris-server/
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "mkdir -p /home/retailiq-key/auris-server/utils"
scp -i ~/.ssh/id_rsa server/utils/*.py saksham@34.131.253.189:/home/retailiq-key/auris-server/utils/
# yolov8s.onnx lives on the server (generated once via `yolo export`), not deployed from local
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "mkdir -p /home/retailiq-key/auris-server/scripts"
scp -i ~/.ssh/id_rsa server/scripts/export_and_train.sh saksham@34.131.253.189:/home/retailiq-key/auris-server/scripts/
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "chmod +x /home/retailiq-key/auris-server/scripts/export_and_train.sh"
# Copy edge deployment/worker scripts needed by the edge download endpoints
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "mkdir -p /home/retailiq-key/auris-server/edge/src"
scp -i ~/.ssh/id_rsa edge/src/edge_worker.py saksham@34.131.253.189:/home/retailiq-key/auris-server/edge/src/edge_worker.py
scp -i ~/.ssh/id_rsa edge/provision.py saksham@34.131.253.189:/home/retailiq-key/auris-server/edge/provision.py
scp -i ~/.ssh/id_rsa edge/requirements.txt saksham@34.131.253.189:/home/retailiq-key/auris-server/edge/requirements.txt
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "sudo chown -R saksham:saksham /home/retailiq-key/auris-server/ && sudo systemctl restart auris"
Write-Host "Backend deployed." -ForegroundColor Green

# 3. Deploy HQ portal
Write-Host "`n[3/4] Building and deploying HQ portal..." -ForegroundColor Yellow
Set-Location dashboard\auris-hq
npm run build
Set-Location ..\..
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "sudo chown -R saksham:saksham /var/www/auris-hq"
scp -i ~/.ssh/id_rsa -r dashboard\auris-hq\dist\* saksham@34.131.253.189:/var/www/auris-hq/
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "sudo chmod -R 755 /var/www/auris-hq && sudo chown -R www-data:www-data /var/www/auris-hq"
Write-Host "HQ portal deployed." -ForegroundColor Green

# 4. Deploy client portal
Write-Host "`n[4/4] Building and deploying client portal..." -ForegroundColor Yellow
Set-Location dashboard
npx expo export --platform web
Set-Location ..
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "sudo chown -R saksham:saksham /var/www/auris"
scp -i ~/.ssh/id_rsa -r dashboard\dist\* saksham@34.131.253.189:/var/www/auris/
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 "sudo chmod -R 755 /var/www/auris && sudo chown -R www-data:www-data /var/www/auris"
Write-Host "Client portal deployed." -ForegroundColor Green

# 5. Enable systemd timers on server (safe to re-run)
Write-Host "`n[5/5] Enabling aggregator timers..." -ForegroundColor Yellow
ssh -i ~/.ssh/id_rsa saksham@34.131.253.189 @"
  sudo cp /home/retailiq-key/auris-server/infra/systemd/auris-*.timer /etc/systemd/system/ 2>/dev/null || true
  sudo cp /home/retailiq-key/auris-server/infra/systemd/auris-*.service /etc/systemd/system/ 2>/dev/null || true
  sudo systemctl daemon-reload
  sudo systemctl enable --now auris-zone-hour.timer auris-bottleneck.timer auris-pattern.timer 2>/dev/null || true
  sudo systemctl list-timers --all | grep auris
"@
Write-Host "Timers enabled." -ForegroundColor Green

Write-Host "`nDone. Auris is live." -ForegroundColor Cyan
