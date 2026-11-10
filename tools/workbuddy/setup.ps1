param([string]$NodeBin = 'node', [string]$NpmCli, [switch]$SkipDependencies)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$gateway = Join-Path $repo '.local/workbuddy-gateway'
$stateDir = Join-Path $repo '.local/workbuddy'
$pin = 'fbaaa2ef6d6cb59f48b953a1f27058202a81553f'
if ($env:OS -ne 'Windows_NT') { throw 'This adapter is currently tested on Windows only.' }
$version = & $NodeBin -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [int]($version.Split('.')[0]) -lt 24) { throw 'Install Node.js 24 LTS first.' }
Get-Command git -ErrorAction Stop | Out-Null
if (-not (Test-Path -LiteralPath $gateway)) {
  & git clone --no-checkout https://github.com/dudu555-djiao/codex-workbuddy-gateway.git $gateway
  if ($LASTEXITCODE -ne 0) { throw 'Gateway download failed; no configuration was changed.' }
  & git -C $gateway checkout --detach $pin
  if ($LASTEXITCODE -ne 0) { throw 'Pinned gateway checkout failed.' }
}
$actualPin = & git -C $gateway rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actualPin.Trim() -ne $pin) { throw 'Existing gateway differs from the reviewed version; preserve it and resolve manually.' }
if (-not $SkipDependencies) {
  Push-Location $gateway
  try {
    if ($NpmCli) { & $NodeBin $NpmCli ci --ignore-scripts --no-audit --no-fund }
    else { & npm.cmd ci --ignore-scripts --no-audit --no-fund }
    if ($LASTEXITCODE -ne 0) { throw 'Gateway dependency installation failed.' }
    & $NodeBin (Join-Path $gateway 'node_modules/typescript/bin/tsc') -p (Join-Path $gateway 'tsconfig.json')
    if ($LASTEXITCODE -ne 0) { throw 'Gateway build failed.' }
  } finally { Pop-Location }
}
if (-not (Test-Path (Join-Path $gateway 'dist/native-desktop-trigger.js'))) { throw 'Gateway is not built.' }
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$configFile = Join-Path $stateDir 'config.json'
if (-not (Test-Path -LiteralPath $configFile)) {
  $config = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'config.example.json') | ConvertFrom-Json
  $config.workspace = $repo
  $config.gatewayDir = $gateway
  $config.stateDir = $stateDir
  $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configFile -Encoding UTF8
}
& $NodeBin (Join-Path $PSScriptRoot 'client.mjs') doctor
if ($LASTEXITCODE -ne 0) { throw 'Local configuration check failed.' }
Write-Output 'Prepared. Sign in to WorkBuddy on this computer, start its local connection, then run client.mjs models and init. Existing local config was preserved.'
