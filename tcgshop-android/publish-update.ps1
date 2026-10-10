param([string]$Apk='',[string]$Notes='修复与功能更新。',[string]$Output='')
$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
if(!$Apk){$Apk=Join-Path $project '安装包/TCGshop-POS-v2.0.3.apk'}
if(!$Output){$Output=Join-Path $project 'tcgshop-server/release'}
$Apk=(Resolve-Path -LiteralPath $Apk).Path
$jdk=(Get-ChildItem -LiteralPath "$PSScriptRoot/tools" -Directory | Where-Object Name -Like 'jdk-21*' | Select-Object -First 1).FullName
$bt='C:/Users/developer/AppData/Local/Android/Sdk/build-tools/36.0.0'
$cert=& "$jdk/bin/java.exe" -jar "$bt/lib/apksigner.jar" verify --print-certs $Apk
if($LASTEXITCODE -ne 0){throw 'APK 签名校验失败'}
$original=& "$jdk/bin/java.exe" -jar "$bt/lib/apksigner.jar" verify --print-certs (Join-Path $project '安装包/TCGshop-POS-v2.0.0.apk')
if($LASTEXITCODE -ne 0){throw '原版 APK 签名校验失败'}
$digest=$cert | Select-String 'certificate SHA-256 digest:' | ForEach-Object {$_.ToString()}
$oldDigest=$original | Select-String 'certificate SHA-256 digest:' | ForEach-Object {$_.ToString()}
if(!$digest -or $digest -ne $oldDigest){throw '签名与现有 App 不一致，禁止发布'}
$badging=& "$bt/aapt2.exe" dump badging $Apk
if($LASTEXITCODE -ne 0){throw '读取 APK 版本失败'}
$meta=[regex]::Match(($badging -join "`n"),"package: name='com.tcgshop.pos' versionCode='(\d+)' versionName='(\d+\.\d+\.\d+)'")
if(!$meta.Success){throw 'APK 包名或版本格式不正确'}
if($Notes.Length -gt 4000){throw '更新说明不能超过 4000 字'}
$hash=(Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash.ToLowerInvariant()
$size=(Get-Item -LiteralPath $Apk).Length
if($size -gt 104857600){throw '安装包不能超过 100MB'}
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$manifest=Join-Path $Output 'latest.json'
if(Test-Path -LiteralPath $manifest){$old=Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json;if([int]$meta.Groups[1].Value -le [int]$old.versionCode -and $old.sha256 -ne $hash){throw '新发布的 versionCode 必须递增'}}
Copy-Item -LiteralPath $Apk -Destination (Join-Path $Output "$hash.apk") -Force
$data=[ordered]@{schema=1;packageName='com.tcgshop.pos';versionCode=[int]$meta.Groups[1].Value;versionName=$meta.Groups[2].Value;sha256=$hash;size=$size;notes=$Notes}
[IO.File]::WriteAllText("$manifest.tmp",($data|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath "$manifest.tmp" -Destination $manifest -Force
Write-Output "更新文件已生成：$Output"
