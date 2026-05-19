Write-Host "Installing dependencies and building Customer Analytics (Expo Web)..." -ForegroundColor Green
npm install
npx expo export --platform web

Write-Host "Running deploy.ps1..." -ForegroundColor Green
& ".\deploy.ps1"
