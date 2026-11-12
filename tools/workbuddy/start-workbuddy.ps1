param([string]$ConfigFile)
$ErrorActionPreference = 'Stop'
if (-not $ConfigFile) { $ConfigFile = Join-Path $PSScriptRoot '../../.local/workbuddy/config.json' }
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigFile | ConvertFrom-Json
$port = [int]$config.port
if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid local port.' }
if (-not (Test-Path -LiteralPath $config.executable -PathType Leaf)) { throw 'Install WorkBuddy or correct executable in the local config.' }
if (@(Get-Process WorkBuddy -ErrorAction SilentlyContinue).Count -gt 0) { throw 'WorkBuddy is already running. Finish current tasks and quit it normally first; this script never forces termination.' }
$previous = $env:WORKBUDDY_REMOTE_DEBUGGING_PORT
try {
  $env:WORKBUDDY_REMOTE_DEBUGGING_PORT = [string]$port
  Start-Process -FilePath $config.executable -ArgumentList "--remote-debugging-port=$port", '--remote-debugging-address=127.0.0.1' -WindowStyle Hidden
} finally { $env:WORKBUDDY_REMOTE_DEBUGGING_PORT = $previous }
Write-Output 'Started WorkBuddy. After it is ready, run client.mjs models to verify native connectivity.'
