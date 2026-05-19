Write-Host "Creating /var/www/auris-hq on server..." -ForegroundColor Green
ssh auris-server "sudo mkdir -p /var/www/auris-hq && sudo chown -R retailiq-key:retailiq-key /var/www/auris-hq"

Write-Host "Uploading to server..." -ForegroundColor Green
scp -i "C:\Users\SAKSHAM\.ssh\retailiq_key.pem" -r auris-hq/dist/* retailiq-key@98.70.41.191:/var/www/auris-hq/

Write-Host "Setting permissions..." -ForegroundColor Green
ssh auris-server "sudo chmod -R 755 /var/www/auris-hq && sudo chown -R www-data:www-data /var/www/auris-hq"

Write-Host "HQ deployed!" -ForegroundColor Green
