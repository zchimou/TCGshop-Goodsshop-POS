param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$connection='nasuser@192.0.2.10'
try {
 . (Join-Path $PSScriptRoot 'zip-tools.ps1')
 Write-Host '正在查找已生成的新版本发布文件…'
 $candidates=@(Get-ChildItem -LiteralPath (Join-Path $project 'tcgshop-server') -Directory | Where-Object Name -Like 'release*' | ForEach-Object {
  $manifest=Join-Path $_.FullName 'latest.json'
  if(Test-Path -LiteralPath $manifest){$m=Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json;[PSCustomObject]@{Dir=$_.FullName;Manifest=$m}}
 })
 $release=$candidates | Sort-Object { [long]$_.Manifest.versionCode } -Descending | Select-Object -First 1
 if(!$release){throw '没有找到发布文件，请先生成新版 APK 和发布清单。'}
 $m=$release.Manifest
 if($m.packageName -ne 'com.tcgshop.pos' -or $m.sha256 -notmatch '^[a-f0-9]{64}$' -or $m.versionName -notmatch '^\d+\.\d+\.\d+$'){throw '发布清单不正确'}
 $apk=Join-Path $release.Dir ($m.sha256+'.apk')
 if(!(Test-Path -LiteralPath $apk)){throw '发布文件中缺少 APK'}
 if((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant() -ne $m.sha256 -or (Get-Item -LiteralPath $apk).Length -ne $m.size){throw 'APK 校验失败，尚未上传任何文件'}
 $name='tcgshop-publish-'+$m.versionName+'-'+$m.sha256.Substring(0,8)
 $stage=Join-Path $env:TEMP ($name+'-'+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path (Join-Path $stage 'release') -Force | Out-Null
 Copy-Item -LiteralPath $apk,(Join-Path $release.Dir 'latest.json') -Destination (Join-Path $stage 'release')
 Copy-Item -LiteralPath (Join-Path $project 'tcgshop-server/publish-release.sh') -Destination (Join-Path $stage 'publish.sh')
 $zip=Join-Path $stage ($name+'.zip')
 New-PortableZip -SourceDirectory $stage -DestinationPath $zip
 if($CheckOnly){Write-Output ('CHECK PASSED: '+$m.versionName);Write-Output $zip;return}
 Write-Host ('即将发布 '+$m.versionName+'，请按提示输入 NAS 密码。密码不会显示，也不会保存。')
 & scp -o ConnectTimeout=15 $zip ($connection+':'+$name+'.zip')
 if($LASTEXITCODE -ne 0){throw '上传失败，NAS 发布版本未切换'}
 $remote='set -e'+"`n"+'unzip -oq "$HOME/'+$name+'.zip" -d "$HOME/'+$name+'"'+"`n"+'sudo sh "$HOME/'+$name+'/publish.sh"'
 & ssh -t -o ConnectTimeout=15 $connection $remote
 if($LASTEXITCODE -ne 0){throw 'NAS 发布失败，请查看上面的错误信息'}
 Write-Host '正在检查外网更新入口…'
 $online=Invoke-RestMethod -Uri 'https://pos.example.com/tcgshop/api/update' -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
 if($online.versionCode -ne $m.versionCode -or $online.sha256 -ne $m.sha256){throw 'NAS 已执行发布，但外网返回版本不一致，请保留窗口截图检查'}
 Write-Host ('发布成功：'+$online.versionName+'。旧版 App 联网打开后会要求更新。') -ForegroundColor Green
}catch{
 Write-Host ('操作未完成：'+$_.Exception.Message) -ForegroundColor Red
}finally{
 if(!$CheckOnly){Read-Host '按回车关闭窗口'}
}
