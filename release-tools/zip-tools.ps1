Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-PortableZip([string]$Path) {
 $archive = [IO.Compression.ZipFile]::OpenRead($Path)
 try {
  foreach ($entry in $archive.Entries) {
   if ($entry.FullName.Contains('\') -or $entry.FullName.StartsWith('/') -or $entry.FullName -match '(^|/)\.\.(/|$)|:') {
    throw ('Non-portable ZIP entry: ' + $entry.FullName)
   }
  }
 } finally { $archive.Dispose() }
}

function New-PortableZip([string]$SourceDirectory, [string]$DestinationPath) {
 $root = [IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
 $destination = [IO.Path]::GetFullPath($DestinationPath)
 $files = @(Get-ChildItem -LiteralPath $root -File -Recurse | Where-Object { $_.FullName -ne $destination })
 $archive = [IO.Compression.ZipFile]::Open($destination, [IO.Compression.ZipArchiveMode]::Create)
 try {
  foreach ($file in $files) {
   $entryName = $file.FullName.Substring($root.Length).Replace('\', '/')
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
 } finally { $archive.Dispose() }
 Assert-PortableZip $destination
}
