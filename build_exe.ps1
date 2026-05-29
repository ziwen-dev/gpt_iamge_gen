$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:GPT_IMAGE_TOOL_ROOT = (Resolve-Path $PSScriptRoot).Path

Write-Host "[build] pip install pyinstaller..."
python -m pip install -q "pyinstaller>=6.0"

Write-Host "[build] PyInstaller onefile..."
python -m PyInstaller --noconfirm gpt-image-tool.spec

Write-Host "[build] OK -> dist\gpt-image-tool-server.exe"
Write-Host "[hint] Put .env next to exe; output/ is created next to exe."
Write-Host "[hint] Default URL http://127.0.0.1:5050 (env PORT to change)."
