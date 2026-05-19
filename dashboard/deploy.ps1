Write-Host "Building Auris web app..." -ForegroundColor Green
npx expo export --platform web

Write-Host "Fixing permissions on server..." -ForegroundColor Green
ssh auris-server "sudo chown -R retailiq-key:retailiq-key /var/www/auris"

Write-Host "Uploading to server..." -ForegroundColor Green
scp -i "C:\Users\SAKSHAM\.ssh\retailiq_key.pem" -r dist/* retailiq-key@98.70.41.191:/var/www/auris/

Write-Host "Setting permissions..." -ForegroundColor Green
ssh auris-server "sudo chmod -R 755 /var/www/auris && sudo chown -R www-data:www-data /var/www/auris"

Write-Host "Done! Live at https://auris.skymlabs.com" -ForegroundColor Green
