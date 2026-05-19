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

Write-Host "Creating Nginx configuration..." -ForegroundColor Green
$nginxConfig | ssh auris-server "sudo tee /etc/nginx/sites-available/auris-hq > /dev/null"

Write-Host "Enabling site..." -ForegroundColor Green
ssh auris-server "sudo ln -sf /etc/nginx/sites-available/auris-hq /etc/nginx/sites-enabled/auris-hq"

Write-Host "Testing Nginx configuration..." -ForegroundColor Green
ssh auris-server "sudo nginx -t"

Write-Host "Reloading Nginx..." -ForegroundColor Green
ssh auris-server "sudo systemctl reload nginx"

Write-Host "Securing with SSL (Certbot)..." -ForegroundColor Green
ssh auris-server "sudo certbot --nginx -d hq.skymlabs.com --non-interactive --agree-tos --redirect -m hq@skymlabs.com"

Write-Host "Done! Your site should now be live." -ForegroundColor Green
