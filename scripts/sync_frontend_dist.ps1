# 将 frontend/dist 同步到 deploy/www（本地预览或打包进部署目录）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "frontend\dist"
$dst = Join-Path $root "deploy\www"
if (-not (Test-Path $src)) {
    Write-Error "请先执行: cd frontend; npm run build"
}
New-Item -ItemType Directory -Force -Path $dst | Out-Null
robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { exit $LASTEXITCODE }
Write-Host "已同步到 $dst"
