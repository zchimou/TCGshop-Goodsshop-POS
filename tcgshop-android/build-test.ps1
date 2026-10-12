param([string]$SdkRoot = "$env:USERPROFILE\AppData\Local\Android\Sdk",[string]$JdkRoot = $env:JAVA_HOME,[string]$SigningKey = $env:TCGSHOP_SIGNING_KEY,[string]$KeyAlias = 'androiddebugkey',[string]$StorePassword = $env:TCGSHOP_STORE_PASSWORD,[string]$KeyPassword = $env:TCGSHOP_KEY_PASSWORD)
$ErrorActionPreference='Stop'
$androidRoot=$PSScriptRoot
$projectRoot=Split-Path -Parent $androidRoot
if (!$JdkRoot) {$JdkRoot=(Get-ChildItem -LiteralPath "$androidRoot\tools" -Directory | Where-Object Name -Like 'jdk-21*' | Select-Object -First 1).FullName}
if (!(Test-Path -LiteralPath "$JdkRoot\bin\javac.exe")) {throw 'JDK compiler missing. Set -JdkRoot.'}
$bt=Join-Path $SdkRoot 'build-tools\36.0.0'
$jar=Join-Path $SdkRoot 'platforms\android-37.0\android.jar'
$key=$SigningKey
if(!$StorePassword){throw 'Set TCGSHOP_STORE_PASSWORD or -StorePassword.'}
if(!$KeyPassword){$KeyPassword=$StorePassword}
if (!(Test-Path -LiteralPath $key)) {throw 'Signing key missing. Set -SigningKey.'}
$build=Join-Path $androidRoot 'out\v1.1.1-test1'
$assets=Join-Path $build 'assets'
New-Item -ItemType Directory -Path $build -Force | Out-Null
$testManifest=Join-Path $build 'AndroidManifest.xml'
$manifest=[IO.File]::ReadAllText((Join-Path $androidRoot 'app/src/main/AndroidManifest.xml')).Replace('android:versionCode="36"','android:versionCode="37"').Replace('android:versionName="1.1.0"','android:versionName="1.1.1-test1"')
[IO.File]::WriteAllText($testManifest,$manifest,[Text.UTF8Encoding]::new($false))
$apk=Join-Path $androidRoot 'TCGshop-POS-v1.1.1-test1.apk'
foreach($dir in @($build,"$build\classes","$build\dex","$assets\vendor",(Split-Path $apk -Parent))) {New-Item -ItemType Directory -Path $dir -Force | Out-Null}
function Check([string]$stage) {if($LASTEXITCODE -ne 0){throw "$stage failed: $LASTEXITCODE"}}
# Licenses are copied by their source names below, as well as every runtime asset.
$files=@('index.html','style.css','theme.css','app.js','auth.js','shops.js','sync-core.js','sync-delta.js','sync-assets.js','nas-sync.js','camera.js','product-editor.js','scanner.js','refunds.js','printer.js','receipt-codes.js','loyverse-import.js','vendor\zxing-browser-0.2.1.min.js')
foreach($f in $files){Copy-Item -LiteralPath (Join-Path "$projectRoot\pos" $f) -Destination (Join-Path $assets $f) -Force}
Get-ChildItem -LiteralPath "$projectRoot\pos\vendor" -File | Where-Object Name -Match 'LICENSE|README' | Copy-Item -Destination "$assets\vendor" -Force
Push-Location -LiteralPath $projectRoot
try {
 & "$bt\aapt2.exe" compile --dir 'tcgshop-android/app/src/main/res' -o 'tcgshop-android/out/v1.1.1-test1/resources.zip'; Check 'Resources'
 $source=Get-ChildItem -LiteralPath "$androidRoot\app\src\main\java\com\tcgshop\pos" -Filter '*.java' | Select-Object -ExpandProperty FullName
 & "$JdkRoot\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath $jar -d "$build\classes" @source; Check 'Java'
 $classes=Get-ChildItem -LiteralPath "$build\classes" -Recurse -Filter '*.class' | Select-Object -ExpandProperty FullName
 & "$JdkRoot\bin\java.exe" -cp "$bt\lib\d8.jar" com.android.tools.r8.D8 --lib $jar --min-api 26 --output "$build\dex" @classes; Check 'DEX'
 & "$bt\aapt2.exe" link -o 'tcgshop-android/out/v1.1.1-test1/unsigned.apk' -I $jar --manifest $testManifest 'tcgshop-android/out/v1.1.1-test1/resources.zip' -A 'tcgshop-android/out/v1.1.1-test1/assets'; Check 'Link'
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
 & "$bt\zipalign.exe" -f 4 'tcgshop-android/out/v1.1.1-test1/unsigned.apk' 'tcgshop-android/out/v1.1.1-test1/aligned.apk';Check 'Align'
 & "$JdkRoot\bin\java.exe" -jar "$bt\lib\apksigner.jar" sign --ks $key --ks-key-alias $KeyAlias --ks-pass ('pass:'+$StorePassword) --key-pass ('pass:'+$KeyPassword) --out $apk "$build\aligned.apk";Check 'Sign'
 & "$JdkRoot\bin\java.exe" -jar "$bt\lib\apksigner.jar" verify --verbose $apk;Check 'Signature'
 & "$bt\zipalign.exe" -c 4 'tcgshop-android/TCGshop-POS-v1.1.1-test1.apk';Check 'Alignment'
 $zip=[IO.Compression.ZipFile]::OpenRead($apk)
 try {foreach($f in $files){$entry=$zip.GetEntry('assets/'+$f.Replace('\','/'));if(!$entry){throw "Missing $f"};$stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create();try {$actual=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$hash.Dispose()};if($actual -ne (Get-FileHash -LiteralPath (Join-Path "$projectRoot\pos" $f)).Hash){throw "Stale asset: $f"}}}finally{$zip.Dispose()}
 & "$bt\aapt2.exe" dump badging 'tcgshop-android/TCGshop-POS-v1.1.1-test1.apk';Check 'Manifest'
 Get-FileHash -LiteralPath $apk | Format-List
 New-Item -ItemType Directory -Path (Join-Path $projectRoot '安装包') -Force | Out-Null
 Copy-Item -LiteralPath $apk -Destination (Join-Path $projectRoot '安装包\TCGshop-POS-v1.1.1-test1.apk') -Force
 Write-Output "SUCCESS: $apk"
} finally {Pop-Location}
