param(
    [string]$SdkRoot = 'H:\Android SDK',
    [string]$JdkRoot = 'H:\Android Studio\jbr'
)
$ErrorActionPreference = 'Stop'
$androidRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $androidRoot
Push-Location -LiteralPath $projectRoot
try {
$buildTools = Join-Path $SdkRoot 'build-tools\36.0.0'
$androidJar = Join-Path $SdkRoot 'platforms\android-37.0\android.jar'
$manifestPath = Join-Path $androidRoot 'app\src\main\AndroidManifest.xml'
[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$androidNamespace = 'http://schemas.android.com/apk/res/android'
$versionName = $manifest.manifest.GetAttribute('versionName', $androidNamespace)
$versionCode = $manifest.manifest.GetAttribute('versionCode', $androidNamespace)
if ($versionName -notmatch '^\d+\.\d+(\.\d+)?-preview$') { throw 'Unexpected preview version' }
$artifactVersion = $versionName -replace '-preview$', ''
$buildDir = Join-Path $androidRoot "out\rebuild-v$artifactVersion"
$keystore = Join-Path $androidRoot 'out\debug.keystore'
if (-not (Test-Path -LiteralPath $keystore)) { throw 'Existing signing key missing; do not generate a replacement.' }
foreach ($dir in @($buildDir, "$buildDir\classes", "$buildDir\dex")) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
function Confirm-NativeCommand([string]$stage) {
    if ($LASTEXITCODE -ne 0) { throw "$stage failed (exit $LASTEXITCODE)" }
}
$assetsDir = Join-Path $androidRoot 'app\src\main\assets'
foreach ($asset in @('index.html', 'sync.js', 'store-logo.svg')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $asset) -Destination (Join-Path $assetsDir $asset) -Force
}
# aapt2 on Windows requires relative project paths when the checkout name contains Chinese.
& "$buildTools\aapt2.exe" compile --no-crunch --dir 'android-app/app/src/main/res' -o "android-app/out/rebuild-v$artifactVersion/resources.zip"
Confirm-NativeCommand 'Resource compilation'
& "$JdkRoot\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath $androidJar -d "$buildDir\classes" "$androidRoot\app\src\main\java\com\generic\ledger\MainActivity.java"
Confirm-NativeCommand 'Java compilation'
& "$JdkRoot\bin\java.exe" -cp "$buildTools\lib\d8.jar" com.android.tools.r8.D8 --lib $androidJar --min-api 23 --output "$buildDir\dex" "$buildDir\classes\com\generic\ledger\MainActivity.class"
Confirm-NativeCommand 'DEX compilation'
$unsignedApk = Join-Path $buildDir 'unsigned.apk'
$alignedApk = Join-Path $buildDir 'aligned.apk'
$signedApk = Join-Path $androidRoot "generic-preview-v$artifactVersion.apk"
& "$buildTools\aapt2.exe" link -o "android-app/out/rebuild-v$artifactVersion/unsigned.apk" -I $androidJar --manifest 'android-app/app/src/main/AndroidManifest.xml' "android-app/out/rebuild-v$artifactVersion/resources.zip" -A 'android-app/app/src/main/assets'
Confirm-NativeCommand 'APK linking'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($unsignedApk, 'Update')
try {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$buildDir\dex\classes.dex", 'classes.dex') | Out-Null
} finally { $zip.Dispose() }
& "$buildTools\zipalign.exe" -f 4 "android-app/out/rebuild-v$artifactVersion/unsigned.apk" "android-app/out/rebuild-v$artifactVersion/aligned.apk"
Confirm-NativeCommand 'APK alignment'
& "$JdkRoot\bin\java.exe" -jar "$buildTools\lib\apksigner.jar" sign --ks $keystore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out $signedApk $alignedApk
Confirm-NativeCommand 'APK signing'
& "$JdkRoot\bin\java.exe" -jar "$buildTools\lib\apksigner.jar" verify --verbose --print-certs $signedApk
Confirm-NativeCommand 'Signature verification'
& "$buildTools\zipalign.exe" -c 4 "android-app/generic-preview-v$artifactVersion.apk"
Confirm-NativeCommand 'Alignment verification'
$zip = [IO.Compression.ZipFile]::OpenRead($signedApk)
try {
    foreach ($asset in @('index.html', 'sync.js', 'store-logo.svg')) {
        $entry = $zip.GetEntry("assets/$asset")
        if (-not $entry) { throw "APK missing asset: $asset" }
        $stream = $entry.Open()
        $hash = [Security.Cryptography.SHA256]::Create()
        try { $packagedHash = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose(); $hash.Dispose() }
        if ($packagedHash -ne (Get-FileHash -LiteralPath (Join-Path $projectRoot $asset) -Algorithm SHA256).Hash) {
            throw "Packaged asset differs from current source: $asset"
        }
    }
} finally { $zip.Dispose() }
& "$buildTools\aapt2.exe" dump badging "android-app/generic-preview-v$artifactVersion.apk"
Confirm-NativeCommand 'Manifest verification'
Write-Output "SUCCESS: $signedApk | version $versionName ($versionCode) | latest web assets verified"
} finally { Pop-Location }
