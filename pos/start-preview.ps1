param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$previewUrl = 'http://127.0.0.1:5690/'
$previewRoot = $PSScriptRoot
$previewScript = Join-Path $previewRoot 'serve.cjs'
$previewNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $previewNode) {
    $previewNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $previewNode)) { throw 'Cannot find Node.js.' }
function Test-Preview {
    try {
        $previewResult = Invoke-WebRequest -Uri $previewUrl -TimeoutSec 3 -UseBasicParsing
        return ($previewResult.StatusCode -eq 200 -and $previewResult.Content -match '<title>TCGshop POS</title>')
    } catch { return $false }
}
if (-not $Restart -and (Test-Preview)) { Write-Output "Preview ready: $previewUrl"; exit 0 }
$previewListeners = @(Get-NetTCPConnection -LocalPort 5690 -State Listen -ErrorAction SilentlyContinue)
foreach ($previewListener in $previewListeners) {
    $previewProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($previewListener.OwningProcess)"
    $previewCommand = $previewProcess.CommandLine
    $previewIsOurs = $previewProcess.ExecutablePath -eq $previewNode -and ($previewCommand.Contains($previewScript) -or $previewCommand -match '(?:\s|\")pos[/\\]serve\.cjs(?:\s|\"|$)')
    if (-not $previewIsOurs) { throw 'Port 5690 belongs to another application. No process was stopped.' }
    Stop-Process -Id $previewListener.OwningProcess
}
$previewArgs = '"' + $previewScript + '"'
Start-Process -FilePath $previewNode -ArgumentList $previewArgs -WorkingDirectory $previewRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewRoot 'preview-server.log') -RedirectStandardError (Join-Path $previewRoot 'preview-server-error.log') | Out-Null
for ($previewAttempt = 0; $previewAttempt -lt 10; $previewAttempt++) {
    Start-Sleep -Milliseconds 300
    if (Test-Preview) { Write-Output "Preview ready: $previewUrl"; exit 0 }
}
throw 'Preview did not respond. See preview-server-error.log.'
