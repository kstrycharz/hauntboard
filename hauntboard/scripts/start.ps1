param([switch]$Rebuild)
$ErrorActionPreference = 'Stop'
$releaseRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location -LiteralPath $releaseRoot
try {
  function Invoke-BoardDocker { & docker @args; if ($LASTEXITCODE -ne 0) { throw "Docker failed with exit code $LASTEXITCODE." } }
  $boardCompose = @('compose', '-p', 'hauntboard-poc', '-f', 'compose.localnet.yaml', '-f', 'compose.hauntboard.yaml')
  Invoke-BoardDocker version --format '{{.Server.Version}}'
  Invoke-BoardDocker volume create hauntbox_engine_test_target
  Invoke-BoardDocker volume create hauntbox_rust_registry
  if ($Rebuild -or !(Test-Path -LiteralPath 'hauntboard/web/vendor/wallet-sdk.mjs')) {
    Invoke-BoardDocker compose -f compose.yaml --profile tools run --rm node-tools sh -c 'pnpm --dir hauntboard/browser-sdk install --ignore-workspace --frozen-lockfile && pnpm --dir hauntboard/browser-sdk build'
  }
  $needsRuntimeBuild = $Rebuild
  foreach ($imageName in @('hauntbox-localnet:0.43.0', 'hauntboard-poc-config-init:latest', 'hauntbox-localtest-v2-integration:latest')) {
    $imageId = & docker image ls -q $imageName
    if (!$imageId) { $needsRuntimeBuild = $true }
  }
  if ($needsRuntimeBuild) { Invoke-BoardDocker @boardCompose build validator config-init board-bootstrap }
  if ($Rebuild -or !(Test-Path -LiteralPath 'hauntboard/template/hauntboard.wasm')) {
    Invoke-BoardDocker @boardCompose build board-build
    Invoke-BoardDocker @boardCompose run --rm --no-deps board-build
  }
  Invoke-BoardDocker @boardCompose up --no-build -d validator indexer indexer-independent sender receiver
  Invoke-BoardDocker @boardCompose run --rm --no-deps board-bootstrap
  Invoke-BoardDocker @boardCompose up --no-build -d board-web board-local
  $boardInfo = $null
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try { $boardInfo = Invoke-RestMethod -Uri 'http://localhost:8280/api/config' -TimeoutSec 5; break }
    catch { Start-Sleep -Milliseconds 500 }
  }
  if (!$boardInfo) { throw 'Hauntboard did not become ready. Inspect the Docker service status.' }
  Write-Host "Hauntboard is ready: http://localhost:8280/"
  Write-Host "Independent client: http://localhost:8281/"
  Write-Host "Network: $($boardInfo.network). Wallets use test currency only."
} finally { Pop-Location }
