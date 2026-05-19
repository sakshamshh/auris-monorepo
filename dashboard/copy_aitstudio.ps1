$src = 'C:\Users\SAKSHAM\OneDrive\Documents\AURIS\frontend--aitstudio\FRONT-END-FOR-AURIS-main'
$dest1 = 'C:\Users\SAKSHAM\OneDrive\Documents\AURIS\dashboard\auris-hq'
$dest2 = 'c:\Users\SAKSHAM\auris-app\auris-hq'

Write-Host "Cleaning target directories..." -ForegroundColor Yellow
if (Test-Path $dest1) { Remove-Item -Recurse -Force $dest1 }
if (Test-Path $dest2) { Remove-Item -Recurse -Force $dest2 }

Write-Host "Creating fresh directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $dest1 | Out-Null
New-Item -ItemType Directory -Force -Path $dest2 | Out-Null

Write-Host "Copying AIT Studio dashboard to both canonical workspace targets..." -ForegroundColor Green
Copy-Item -Path "$src\*" -Destination $dest1 -Recurse -Force
Copy-Item -Path "$src\*" -Destination $dest2 -Recurse -Force

Write-Host "Stitched successfully!" -ForegroundColor Green
