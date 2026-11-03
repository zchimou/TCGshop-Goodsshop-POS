param([switch]$CheckOnly,[switch]$VerifyOnly,[string]$StatusFile='')
$ErrorActionPreference='Stop'
$taskUpdateUrl='https://pos.example.com/api/update'
$taskFailed=$false
$taskPublished=$false
function Save-PublishStatus([string]$Stage,[string]$Message=''){
 if($StatusFile){[IO.File]::WriteAllText($StatusFile,([ordered]@{stage=$Stage;version='1.1.2';message=$Message;time=[DateTimeOffset]::Now.ToString('o')}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))}
}
try{
 . (Join-Path $PSScriptRoot 'zip-tools.ps1')
 $taskZip=Join-Path $PSScriptRoot 'TCGshop-POS-release-v1.1.2.zip'
 Assert-PortableZip $taskZip
 $taskArchive=[IO.Compression.ZipFile]::OpenRead($taskZip)
 try{
  if(!$taskArchive.GetEntry('publish-release.sh')){throw '发布包缺少 publish-release.sh'}
  $taskManifestEntry=$taskArchive.GetEntry('release/latest.json');if(!$taskManifestEntry){throw '发布包缺少版本清单'}
  $taskReader=[IO.StreamReader]::new($taskManifestEntry.Open());try{$taskManifest=$taskReader.ReadToEnd()|ConvertFrom-Json}finally{$taskReader.Dispose()}
  if($taskManifest.schema -ne 1 -or $taskManifest.packageName -ne 'com.tcgshop.pos' -or $taskManifest.versionName -ne '1.1.2' -or $taskManifest.versionCode -ne 38 -or $taskManifest.sha256 -notmatch '^[a-f0-9]{64}$'){throw '发布包版本或校验清单不正确'}
  $taskApk=$taskArchive.GetEntry('release/'+$taskManifest.sha256+'.apk');if(!$taskApk -or $taskApk.Length -ne $taskManifest.size){throw '发布包 APK 大小不一致'}
  $taskStream=$taskApk.Open();$taskSha=[Security.Cryptography.SHA256]::Create();try{$taskHash=[BitConverter]::ToString($taskSha.ComputeHash($taskStream)).Replace('-','').ToLowerInvariant()}finally{$taskStream.Dispose();$taskSha.Dispose()}
  if($taskHash -ne $taskManifest.sha256){throw 'APK SHA256 校验失败，尚未上传'}
 }finally{$taskArchive.Dispose()}
 if($CheckOnly){Write-Output 'CHECK PASSED: 1.1.2 / code 38; portable archive and APK SHA256 verified';return}
 $taskId=[guid]::NewGuid().ToString('N')
 if(!$VerifyOnly){
 Get-Command ssh,scp -ErrorAction Stop | Out-Null
 $taskRemoteName='tcgshop-pos-release-1.1.2-'+$taskId+'.zip'
 $taskRemoteFolder='tcgshop-pos-release-1.1.2-'+$taskId
 Save-PublishStatus 'uploading' '等待 NAS SSH 登录并上传发布包'
 Write-Host '发布 1.1.2：只更新自动更新入口的 APK，不重建容器。'
 Write-Host '请按提示输入 NAS 用户 nasuser 的密码；出现 sudo 提示时再次输入。密码不会显示或保存。'
 & scp -o ConnectTimeout=15 $taskZip ('nasuser@192.0.2.10:'+$taskRemoteName)
 if($LASTEXITCODE -ne 0){throw 'NAS 上传未完成，尚未发布新版本'}
 Save-PublishStatus 'publishing' '发布包已上传，等待执行 NAS 发布命令'
 $taskRemote='set -e'+"`n"+'stage="$HOME/'+$taskRemoteFolder+'"'+"`n"+'mkdir -p "$stage"'+"`n"+'unzip -oq "$HOME/'+$taskRemoteName+'" -d "$stage"'+"`n"+'sudo sh "$stage/publish-release.sh"'
 & ssh -t -o ConnectTimeout=15 nasuser@192.0.2.10 $taskRemote
 if($LASTEXITCODE -ne 0){throw 'NAS 发布未确认成功，请查看上方错误信息'}
 $taskPublished=$true
 }
 Save-PublishStatus 'verifying' '正在核对公网更新清单和实际 APK 下载'
 $taskOnline=Invoke-RestMethod -Uri $taskUpdateUrl -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
 if($taskOnline.versionCode -ne 38 -or $taskOnline.versionName -ne '1.1.2' -or $taskOnline.sha256 -ne $taskManifest.sha256 -or $taskOnline.size -ne $taskManifest.size){throw '公网版本与本次 APK 不一致，请保留窗口检查'}
 $taskDownload=Join-Path $env:TEMP ('tcgshop-verify-'+$taskId+'.apk')
 try{
  Invoke-WebRequest -UseBasicParsing -Uri ($taskUpdateUrl+'/apk/'+$taskManifest.sha256+'.apk') -OutFile $taskDownload -TimeoutSec 30
  $taskDownloadedStream=[IO.File]::OpenRead($taskDownload);$taskDownloadSha=[Security.Cryptography.SHA256]::Create()
  try{$taskDownloadedHash=[BitConverter]::ToString($taskDownloadSha.ComputeHash($taskDownloadedStream)).Replace('-','').ToLowerInvariant()}finally{$taskDownloadedStream.Dispose();$taskDownloadSha.Dispose()}
  if((Get-Item -LiteralPath $taskDownload).Length -ne $taskManifest.size -or $taskDownloadedHash -ne $taskManifest.sha256){throw '公网 APK 下载校验失败'}
 }finally{if(Test-Path -LiteralPath $taskDownload){Remove-Item -LiteralPath $taskDownload -Force}}
 $taskLegacy=Invoke-RestMethod -Uri 'https://legacy.example.com/tcgshop/api/update' -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
 if($taskLegacy.versionCode -ne 38 -or $taskLegacy.versionName -ne '1.1.2' -or $taskLegacy.sha256 -ne $taskManifest.sha256){throw '旧域名更新入口尚未返回本次版本，现有设备可能无法获取更新'}
 Save-PublishStatus 'published' '1.1.2 已发布；公网清单、APK 下载及 SHA256 已通过核验'
 Write-Host '发布成功：1.1.2 已推送，其他设备联网后可检查并安装更新。' -ForegroundColor Green
}catch{
 $taskFailed=$true
 if($taskPublished){Save-PublishStatus 'verification_failed' $_.Exception.Message;Write-Host ('NAS 已执行发布，但公网校验未完成：'+$_.Exception.Message) -ForegroundColor Red}
 else{Save-PublishStatus 'failed' $_.Exception.Message;Write-Host ('发布未完成：'+$_.Exception.Message) -ForegroundColor Red}
}finally{if(!$CheckOnly -and !$VerifyOnly){Read-Host '按回车关闭窗口' | Out-Null}}
if($taskFailed){exit 1}
