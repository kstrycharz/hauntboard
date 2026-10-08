$ErrorActionPreference = 'Stop'
$releaseRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location -LiteralPath $releaseRoot
try {
  & docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml down
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop Hauntboard.' }
  Write-Host 'Hauntboard stopped. Its chain, wallets and browser data are preserved.'
} finally { Pop-Location }
