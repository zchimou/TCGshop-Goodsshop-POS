param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$failed=$false
try{
 . (Join-Path $PSScriptRoot 'zip-tools.ps1')
 $candidates=@(Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object Name -Match '^TCGshop-POS-NAS-update-v\d+\.\d+\.\d+\.zip$')
 $releases=@(foreach($candidate in $candidates){
  Assert-PortableZip $candidate.FullName
  $probe=[IO.Compression.ZipFile]::OpenRead($candidate.FullName)
  try{
   $entry=$probe.GetEntry('release/latest.json');if(!$entry){throw ('更新包缺少发布清单：'+$candidate.Name)}
   $reader=[IO.StreamReader]::new($entry.Open());try{$info=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
   if($info.packageName -ne 'com.tcgshop.pos' -or ($info.versionCode -isnot [int] -and $info.versionCode -isnot [long]) -or $info.versionCode -lt 1 -or $info.versionCode -gt 2147483647){throw ('版本编号不正确：'+$candidate.Name)}
   [pscustomobject]@{File=$candidate;Code=[long]$info.versionCode;Hash=$info.sha256}
  }finally{$probe.Dispose()}
 })
 $selected=$releases | Sort-Object Code -Descending | Select-Object -First 1
 if($selected -and @($releases | Where-Object {$_.Code -eq $selected.Code -and $_.Hash -ne $selected.Hash}).Count){throw '发现相同版本编号的不同安装包，请只保留要发布的更新包'}
 $bundle=if($selected){$selected.File}else{$null}
 if(!$bundle){throw '未找到 NAS 更新包，请保持一键工具和更新包在同一文件夹'}
 $zip=$bundle.FullName;$name=$bundle.Name
 Assert-PortableZip $zip
 $archive=[IO.Compression.ZipFile]::OpenRead($zip)
 try{
  foreach($required in @('server.js','sync-core.js','sync-http.js','sync-delta.js','sync-store.js','updates.js','Dockerfile','安装更新.sh','publish-release.sh','release/latest.json')){if(!$archive.GetEntry($required)){throw "更新包缺少 $required"}}
  $reader=[IO.StreamReader]::new($archive.GetEntry('release/latest.json').Open())
  try{$manifest=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
  if($manifest.packageName -ne 'com.tcgshop.pos' -or $manifest.versionName -notmatch '^\d+\.\d+\.\d+$' -or $manifest.sha256 -notmatch '^[a-f0-9]{64}$' -or $manifest.versionCode -lt 1){throw '版本发布清单不正确'}
  if($name -ne ('TCGshop-POS-NAS-update-v'+$manifest.versionName+'.zip')){throw '更新包文件名与版本不一致'}
  $entry=$archive.GetEntry('release/'+$manifest.sha256+'.apk')
  if(!$entry -or $entry.Length -ne $manifest.size){throw '更新包中 APK 缺失或大小不正确'}
  $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
  try{$digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()}
  if($digest -ne $manifest.sha256){throw '更新包 APK 校验失败，尚未上传任何文件'}
 }finally{$archive.Dispose()}
 if($CheckOnly){Write-Output ('CHECK PASSED: NAS '+$manifest.versionName+'; APK SHA256 verified');return}
 Write-Host ('开始上传 '+$manifest.versionName+' 并更新 NAS 服务；按提示输入密码。密码不会显示或保存。')
 & scp -o ConnectTimeout=15 $zip ('nasuser@192.0.2.10:'+$name)
 if($LASTEXITCODE -ne 0){throw '上传失败，尚未执行 NAS 更新'}
 $remote='set -e'+"`n"+'test -f /docker/tcgshop-pos-sync/docker-compose.yml'+"`n"+'sudo unzip -oq "$HOME/'+$name+'" -d /docker/tcgshop-pos-sync'+"`n"+'sudo sh /docker/tcgshop-pos-sync/安装更新.sh'
 & ssh -t -o ConnectTimeout=15 nasuser@192.0.2.10 $remote
 if($LASTEXITCODE -ne 0){throw 'NAS 更新未完成，请查看上面的错误信息'}
 Write-Host '正在核验外网更新入口…'
 $online=Invoke-RestMethod -Uri 'https://pos.example.com/tcgshop/api/update' -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
 if($online.versionCode -ne $manifest.versionCode -or $online.sha256 -ne $manifest.sha256){throw 'NAS 已执行更新，但外网版本或 APK 校验值不一致，请保留窗口截图检查'}
 Write-Host ('更新成功：NAS 服务和 '+$manifest.versionName+' 正式版已发布。') -ForegroundColor Green
}catch{$failed=$true;Write-Host ('操作未完成：'+$_.Exception.Message) -ForegroundColor Red}finally{if(!$CheckOnly){Read-Host '按回车关闭窗口' | Out-Null}}
if($failed){exit 1}
