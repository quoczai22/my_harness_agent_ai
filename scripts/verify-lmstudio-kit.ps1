param(
  [Parameter(Mandatory=$true)][string]$KitRoot,
  [switch]$WriteManifest
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $KitRoot).Path
$modelsPath = Join-Path $rootPath 'models'
$installerPath = Join-Path $rootPath 'installer'
$runtimePath = Join-Path $rootPath 'runtime'
$pdfPath = Join-Path $rootPath 'tools/pdf/pdftotext.exe'
$pdfToolsPath = Join-Path $rootPath 'tools/pdf'
$licensePath = Join-Path $rootPath 'MODEL-LICENSE.txt'
$manifestPath = Join-Path $rootPath 'manifest.json'

if (-not (Test-Path -LiteralPath $modelsPath -PathType Container)) { throw 'Missing models/ folder.' }
if (-not (Test-Path -LiteralPath $installerPath -PathType Container)) { throw 'Missing installer/ folder.' }
if (-not (Test-Path -LiteralPath $runtimePath -PathType Container)) { throw 'Missing runtime/ folder. Pre-stage the LM Studio runtime while online.' }
if (-not (Test-Path -LiteralPath $pdfPath -PathType Leaf)) { throw 'Missing tools/pdf/pdftotext.exe.' }
if (-not (Test-Path -LiteralPath $licensePath -PathType Leaf)) { throw 'Missing MODEL-LICENSE.txt.' }

$models = @(Get-ChildItem -LiteralPath $modelsPath -Recurse -File -Filter '*.gguf')
$installers = @(Get-ChildItem -LiteralPath $installerPath -File -Filter '*.exe')
$runtimes = @(Get-ChildItem -LiteralPath $runtimePath -Recurse -File)
$pdfTools = @(Get-ChildItem -LiteralPath $pdfToolsPath -Recurse -File)
if ($models.Count -eq 0) { throw 'No GGUF model files found.' }
if ($installers.Count -eq 0) { throw 'No LM Studio Windows installer found.' }
if ($runtimes.Count -eq 0) { throw 'Runtime folder is empty.' }
$modelBytes = [long](($models | Measure-Object -Property Length -Sum).Sum)
if ($modelBytes -gt 3000000000) { throw "Model files exceed the 3 GB limit: $modelBytes bytes." }

$kitEntries = @(Get-ChildItem -LiteralPath $rootPath -Recurse -Force)
if (@($kitEntries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) { throw 'Kit contains a reparse point.' }
$files = @($kitEntries | Where-Object { -not $_.PSIsContainer -and $_.FullName -ne $manifestPath }) | ForEach-Object {
  [pscustomobject]@{
    path = $_.FullName.Substring($rootPath.TrimEnd('\').Length + 1).Replace('\','/')
    bytes = $_.Length
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
if ($WriteManifest) {
  [pscustomobject]@{ schema = 1; modelBytes = $modelBytes; files = $files } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
} else {
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Missing manifest.json. Run once with -WriteManifest on the preparation machine.' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.modelBytes -ne $modelBytes) { throw 'Model byte count changed.' }
  foreach ($entry in $manifest.files) {
    $actual = $files | Where-Object { $_.path -eq $entry.path } | Select-Object -First 1
    if (-not $actual -or $actual.bytes -ne $entry.bytes -or $actual.sha256 -ne $entry.sha256) { throw "Kit file mismatch: $($entry.path)" }
  }
  if (@($manifest.files).Count -ne @($files).Count) { throw 'Kit file count changed.' }
}
Write-Output "Kit verified: $modelBytes model bytes, $($files.Count) hashed files. Runtime function and 8 GB RAM still require an offline machine test."
