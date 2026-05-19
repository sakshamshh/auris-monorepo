Write-Host "=============================================" -ForegroundColor Green
Write-Host "     Deploying AURIS Server to Azure VM       " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# 1. Push latest backend changes to GitHub first
Push-Location "C:\Users\SAKSHAM\OneDrive\Documents\AURIS\server"
Write-Host "1. Committing and pushing latest changes to GitHub..." -ForegroundColor Yellow
git add main.py
git commit -m "Fix CORS allowed origins to support hq.skymlabs.com preflights"
git push origin main
Pop-Location

# 2. Upload changes directly via SCP and restart FastAPI server on Azure VM
Write-Host "2. Uploading main.py, db.py, and deploy.sh to Azure VM..." -ForegroundColor Yellow
scp -i "C:\Users\SAKSHAM\.ssh\retailiq_key.pem" "C:\Users\SAKSHAM\OneDrive\Documents\AURIS\server\main.py" retailiq-key@98.70.41.191:/home/retailiq-key/auris-server/
scp -i "C:\Users\SAKSHAM\.ssh\retailiq_key.pem" "C:\Users\SAKSHAM\OneDrive\Documents\AURIS\server\db.py" retailiq-key@98.70.41.191:/home/retailiq-key/auris-server/
scp -i "C:\Users\SAKSHAM\.ssh\retailiq_key.pem" "C:\Users\SAKSHAM\OneDrive\Documents\AURIS\server\deploy.sh" retailiq-key@98.70.41.191:/home/retailiq-key/auris-server/
ssh auris-server "cd /home/retailiq-key/auris-server && chmod +x deploy.sh && sudo ./deploy.sh"



Write-Host "=============================================" -ForegroundColor Green
Write-Host "   ✅ FastAPI server deployed and restarted!  " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
