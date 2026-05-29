$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker 未运行。请先启动 Docker Desktop，或在 Linux 服务器上执行 ./build_linux.sh"
}

Write-Host "[build] Docker Linux onefile..."
docker build -f deploy/docker/build-linux.Dockerfile -t gpt-image-tool-build .
if ($LASTEXITCODE -ne 0) { throw "docker build failed with exit code $LASTEXITCODE" }

New-Item -ItemType Directory -Force -Path dist | Out-Null
$cid = docker create gpt-image-tool-build
if ($LASTEXITCODE -ne 0 -or -not $cid) { throw "docker create failed" }
try {
  docker cp "${cid}:/out/gpt-image-tool-server" "dist/gpt-image-tool-server"
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed" }
} finally {
  docker rm -f $cid 2>$null | Out-Null
}

if (-not (Test-Path "dist/gpt-image-tool-server")) {
  throw "Build finished but dist/gpt-image-tool-server was not found."
}

Write-Host "[build] OK -> dist/gpt-image-tool-server"
Write-Host "[hint] Copy to Linux server with .env beside the binary."
Write-Host "[hint] Run: chmod +x gpt-image-tool-server && PORT=5050 ./gpt-image-tool-server"
