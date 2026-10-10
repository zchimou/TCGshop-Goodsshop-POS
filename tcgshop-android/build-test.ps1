param([string]$SdkRoot = "$env:USERPROFILE\AppData\Local\Android\Sdk",[string]$JdkRoot = '')
$ErrorActionPreference='Stop'
$androidRoot=$PSScriptRoot
$projectRoot=Split-Path -Parent $androidRoot
if (!$JdkRoot) {$JdkRoot=(Get-ChildItem -LiteralPath "$androidRoot\tools" -Directory | Where-Object Name -Like 'jdk-21*' | Select-Object -First 1).FullName}
if (!(Test-Path -LiteralPath "$JdkRoot\bin\javac.exe")) {throw 'JDK compiler missing. Set -JdkRoot.'}
$bt=Join-Path $SdkRoot 'build-tools\36.0.0'
$jar=Join-Path $SdkRoot 'platforms\android-37.0\android.jar'
$key=Join-Path $projectRoot 'android-app\out\debug.keystore'
if (!(Test-Path -LiteralPath $key)) {throw 'Existing debug signing key missing.'}
$build=Join-Path $androidRoot 'out\v1.4.1-test'
$assets=Join-Path $build 'assets'
$apk=Join-Path $androidRoot 'TCGshop-POS-v1.4.1-test.apk'
foreach($dir in @($build,"$build\classes","$build\dex","$assets\vendor",(Split-Path $apk -Parent))) {New-Item -ItemType Directory -Path $dir -Force | Out-Null}
function Check([string]$stage) {if($LASTEXITCODE -ne 0){throw "$stage failed: $LASTEXITCODE"}}
# Licenses are copied by their source names below, as well as every runtime asset.
$files=@('index.html','style.css','app.js','auth.js','shops.js','sync-core.js','nas-sync.js','camera.js','product-editor.js','scanner.js','refunds.js','vendor\zxing-browser-0.2.1.min.js')
foreach($f in $files){Copy-Item -LiteralPath (Join-Path "$projectRoot\pos" $f) -Destination (Join-Path $assets $f) -Force}
Get-ChildItem -LiteralPath "$projectRoot\pos\vendor" -File | Where-Object Name -Match 'LICENSE|README' | Copy-Item -Destination "$assets\vendor" -Force
Push-Location -LiteralPath $projectRoot
try {
 & "$bt\aapt2.exe" compile --dir 'tcgshop-android/app/src/main/res' -o 'tcgshop-android/out/v1.4.1-test/resources.zip'; Check 'Resources'
 $source=Get-ChildItem -LiteralPath "$androidRoot\app\src\main\java\com\tcgshop\pos" -Filter '*.java' | Select-Object -ExpandProperty FullName
 & "$JdkRoot\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath $jar -d "$build\classes" @source; Check 'Java'
 $classes=Get-ChildItem -LiteralPath "$build\classes" -Recurse -Filter '*.class' | Select-Object -ExpandProperty FullName
 & "$JdkRoot\bin\java.exe" -cp "$bt\lib\d8.jar" com.android.tools.r8.D8 --lib $jar --min-api 26 --output "$build\dex" @classes; Check 'DEX'
 & "$bt\aapt2.exe" link -o 'tcgshop-android/out/v1.4.1-test/unsigned.apk' -I $jar --manifest 'tcgshop-android/app/src/main/AndroidManifest.xml' 'tcgshop-android/out/v1.4.1-test/resources.zip' -A 'tcgshop-android/out/v1.4.1-test/assets'; Check 'Link'
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::Open("$build\unsigned.apk",'Update')
 try {
  # Windows aapt2 emits backslashes for nested assets; APK asset names must use '/'.
  foreach($entry in @($zip.Entries | Where-Object {$_.FullName.Contains('\')})) {
   $oldStream=$entry.Open();$buffer=[IO.MemoryStream]::new();$oldStream.CopyTo($buffer);$oldStream.Dispose();$buffer.Position=0
   $fixed=$zip.CreateEntry($entry.FullName.Replace('\','/'));$newStream=$fixed.Open();$buffer.CopyTo($newStream);$newStream.Dispose();$buffer.Dispose();$entry.Delete()
  }
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,"$build\dex\classes.dex",'classes.dex') | Out-Null
 } finally {$zip.Dispose()}
 & "$bt\zipalign.exe" -f 4 'tcgshop-android/out/v1.4.1-test/unsigned.apk' 'tcgshop-android/out/v1.4.1-test/aligned.apk';Check 'Align'
 & "$JdkRoot\bin\java.exe" -jar "$bt\lib\apksigner.jar" sign --ks $key --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out $apk "$build\aligned.apk";Check 'Sign'
 & "$JdkRoot\bin\java.exe" -jar "$bt\lib\apksigner.jar" verify --verbose $apk;Check 'Signature'
 & "$bt\zipalign.exe" -c 4 'tcgshop-android/TCGshop-POS-v1.4.1-test.apk';Check 'Alignment'
 $zip=[IO.Compression.ZipFile]::OpenRead($apk)
 try {foreach($f in $files){$entry=$zip.GetEntry('assets/'+$f.Replace('\','/'));if(!$entry){throw "Missing $f"};$stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create();try {$actual=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$hash.Dispose()};if($actual -ne (Get-FileHash -LiteralPath (Join-Path "$projectRoot\pos" $f)).Hash){throw "Stale asset: $f"}}}finally{$zip.Dispose()}
 & "$bt\aapt2.exe" dump badging 'tcgshop-android/TCGshop-POS-v1.4.1-test.apk';Check 'Manifest'
 Get-FileHash -LiteralPath $apk | Format-List
 New-Item -ItemType Directory -Path (Join-Path $projectRoot '安装包') -Force | Out-Null
 Copy-Item -LiteralPath $apk -Destination (Join-Path $projectRoot '安装包\TCGshop-POS-v1.4.1-test.apk') -Force
 Write-Output "SUCCESS: $apk"
} finally {Pop-Location}
