param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
try{
 . (Join-Path $PSScriptRoot 'zip-tools.ps1')
 $name='TCGshop-POS-NAS-update-v2.0.3.zip'
 $zip=Join-Path $PSScriptRoot $name
 if(!(Test-Path -LiteralPath $zip)){throw '未找到 NAS 更新包'}
 Assert-PortableZip $zip
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $archive=[IO.Compression.ZipFile]::OpenRead($zip)
 try{foreach($required in @('server.js','sync-core.js','sync-http.js','updates.js','Dockerfile','安装更新.sh','publish-release.sh','release/latest.json')){if(!$archive.GetEntry($required)){throw "更新包缺少 $required"}}}finally{$archive.Dispose()}
 if($CheckOnly){Write-Output 'CHECK PASSED: NAS 2.0.3 update bundle';return}
 Write-Host '开始上传并更新 NAS 服务；按提示输入密码。密码不会显示或保存。'
 & scp -o ConnectTimeout=15 $zip ('nasuser@192.0.2.10:'+$name)
 if($LASTEXITCODE -ne 0){throw '上传失败，尚未执行 NAS 更新'}
 $remote='set -e'+"`n"+'test -f /vol1/1000/tcgshop-pos-sync/docker-compose.yml'+"`n"+'sudo unzip -oq "$HOME/TCGshop-POS-NAS-update-v2.0.3.zip" -d /vol1/1000/tcgshop-pos-sync'+"`n"+'sudo sh /vol1/1000/tcgshop-pos-sync/安装更新.sh'
 & ssh -t -o ConnectTimeout=15 nasuser@192.0.2.10 $remote
 if($LASTEXITCODE -ne 0){throw 'NAS 更新未完成，请查看上面的错误信息'}
 $online=Invoke-RestMethod -Uri 'https://pos.example.com/tcgshop/api/update' -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
 if($online.versionCode -ne 28){throw '服务已执行更新，但外网版本不是 2.0.3，请截图检查'}
 Write-Host '更新成功：NAS 同步提速服务和 2.0.3 已发布。' -ForegroundColor Green
}catch{Write-Host ('操作未完成：'+$_.Exception.Message) -ForegroundColor Red}finally{if(!$CheckOnly){Read-Host '按回车关闭窗口'}}
