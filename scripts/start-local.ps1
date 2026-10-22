param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath "$taskRoot\.env")) { throw 'Run npm run setup:local first.' }
if (-not (Test-Path -LiteralPath "$taskRoot\.next\standalone\server.js")) { throw 'Run npm run build first.' }
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NODE_OPTIONS = '--max-old-space-size=384 --max-semi-space-size=2'
$env:RAYON_NUM_THREADS = '1'
$env:UV_THREADPOOL_SIZE = '2'
$env:HOSTNAME = '127.0.0.1'
$env:PORT = '3100'
function Test-LocalPort([int]$Port) {
  $socket = New-Object System.Net.Sockets.TcpClient
  try { $socket.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $socket.Dispose() }
}
if (-not (Test-LocalPort 55432)) {
  Start-Process -FilePath $taskNode -ArgumentList '--env-file=.env', 'scripts/local-db.mjs' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$taskRoot\local-db-stdout.log" -RedirectStandardError "$taskRoot\local-db-stderr.log" | Out-Null
}
if (-not (Test-LocalPort 3100)) {
  Copy-Item -LiteralPath "$taskRoot\.next\static" -Destination "$taskRoot\.next\standalone\.next" -Recurse -Force
  Copy-Item -LiteralPath "$taskRoot\public" -Destination "$taskRoot\.next\standalone" -Recurse -Force
  Start-Process -FilePath $taskNode -ArgumentList '--env-file=.env', '.next/standalone/server.js' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$taskRoot\local-web-stdout.log" -RedirectStandardError "$taskRoot\local-web-stderr.log" | Out-Null
}
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $check = Invoke-WebRequest -Uri 'http://127.0.0.1:3100/api/health' -UseBasicParsing -TimeoutSec 2
    if ($check.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'Server did not become ready. See local-web-stderr.log and local-db-stderr.log.' }
Write-Host 'Qarzhy is running: http://127.0.0.1:3100/'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:3100/' }
