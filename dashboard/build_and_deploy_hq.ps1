Write-Host "=============================================" -ForegroundColor Green
Write-Host " Building and Deploying AURIS Admin HQ (Static SPA) " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

Push-Location "auris-hq"

Write-Host "1. Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "2. Building Vite Static Frontend..." -ForegroundColor Yellow
# Run Vite build to create a gorgeous pure static bundle in /dist
npx vite build

Pop-Location

Write-Host "3. Creating target directories on Azure VM..." -ForegroundColor Yellow
ssh auris-server "sudo mkdir -p /var/www/auris-hq && sudo chown -R retailiq-key:retailiq-key /var/www/auris-hq"

Write-Host "4. Uploading static build files to production server..." -ForegroundColor Yellow
# Upload built static files directly to /var/www/auris-hq/
scp -i "C:\Users\SAKSHAM\.ssh\retailiq_key.pem" -r auris-hq/dist/* retailiq-key@98.70.41.191:/var/www/auris-hq/

Write-Host "5. Setting correct Nginx ownership and read/write permissions..." -ForegroundColor Yellow
ssh auris-server "sudo chmod -R 755 /var/www/auris-hq && sudo chown -R www-data:www-data /var/www/auris-hq"

Write-Host "6. Stopping and disabling legacy node background services..." -ForegroundColor Yellow
ssh auris-server "sudo systemctl stop auris-hq || true"
ssh auris-server "sudo systemctl disable auris-hq || true"
ssh auris-server "sudo rm -f /etc/systemd/system/auris-hq.service"
ssh auris-server "sudo systemctl daemon-reload"

Write-Host "7. Updating Nginx Configuration for Static Site serving..." -ForegroundColor Yellow
$nginxConfig = @"
server {
    listen 80;
    server_name hq.skymlabs.com;

    root /var/www/auris-hq;
    index index.html;

    location / {
        try_files `$uri `$uri/ /index.html;
    }
}
"@

$nginxConfig | ssh auris-server "sudo tee /etc/nginx/sites-available/auris-hq > /dev/null"
ssh auris-server "sudo ln -sf /etc/nginx/sites-available/auris-hq /etc/nginx/sites-enabled/auris-hq"
ssh auris-server "sudo systemctl reload nginx"

Write-Host "8. Setting up SSL/HTTPS using Certbot..." -ForegroundColor Yellow
ssh auris-server "sudo certbot --nginx -d hq.skymlabs.com --non-interactive --agree-tos -m admin@skymlabs.com --redirect --keep"

Write-Host "9. Restarting Nginx to securely bind port 443..." -ForegroundColor Yellow
ssh auris-server "sudo systemctl restart nginx"

Write-Host "=============================================" -ForegroundColor Green
Write-Host "   ✅ Admin HQ Portal Live at hq.skymlabs.com! " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

