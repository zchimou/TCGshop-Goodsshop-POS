param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
try {
 $taskScript=Join-Path $PSScriptRoot 'migrate-domain.py'
 if(!(Test-Path -LiteralPath $taskScript)){throw '缺少 migrate-domain.py，请完整解压迁移工具。'}
 $taskText=[IO.File]::ReadAllText($taskScript)
 if(!$taskText.Contains("DOMAIN = 'pos.example.com'")){throw '迁移脚本中的域名不符合本更新。'}
 Get-Command ssh,scp -ErrorAction Stop | Out-Null
 if($CheckOnly){Write-Output 'CHECK PASSED: domain migration tool and SSH/SCP';return}
 $taskLocation=''
 try {
  $taskProbe=Invoke-WebRequest -Uri 'http://pos.example.com/.well-known/acme-challenge/pos-migration-check' -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 15 -ErrorAction Stop
  $taskLocation=$taskProbe.Headers['Location']
 }catch {
  if(!$_.Exception.Response){throw}
  $taskLocation=$_.Exception.Response.Headers['Location']
 }
 if($taskLocation -match '^https?://dnspod\.qcloud\.com/static/webblock\.html(?:\?|$)'){throw '新域名仍被腾讯云备案拦截，请完成备案后重试；尚未更改服务器。'}
 $taskRemoteFile='tcgshop-domain-'+[guid]::NewGuid().ToString('N')+'.py'
 Write-Host '将配置 pos.example.com 的 HTTPS；按提示在此窗口输入服务器密码，密码不会显示。'
 & scp -o ConnectTimeout=15 $taskScript ('ubuntu@192.0.2.20:'+$taskRemoteFile)
 if($LASTEXITCODE -ne 0){throw '上传失败，尚未更改服务器配置。'}
 $taskCommand='sudo python3 "$HOME/'+$taskRemoteFile+'"'
 & ssh -t -o ConnectTimeout=15 ubuntu@192.0.2.20 $taskCommand
 if($LASTEXITCODE -ne 0){throw '域名配置未完成，请保留上方 STOP 提示。'}
 $taskOnline=Invoke-RestMethod -Uri 'https://pos.example.com/tcgshop/api/update' -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
 if($taskOnline.packageName -ne 'com.tcgshop.pos'){throw '外网返回的不是 POS 更新服务。'}
 Write-Host ('域名配置成功；当前服务器版本：'+$taskOnline.versionName) -ForegroundColor Green
 Write-Host 'App 的 NAS 服务地址可改为 https://pos.example.com/tcgshop，同步密钥沿用原值。'
}catch{
 Write-Host ('操作未完成：'+$_.Exception.Message) -ForegroundColor Red
 exit 1
}
