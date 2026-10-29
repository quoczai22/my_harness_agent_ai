param(
  [string]$Output = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Flutter-Exam-Bundle'),
  [string]$LmKit = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Harness-LMStudio-Offline-Kit')
)
# Preparation PC only: assemble one portable folder from the verified local kits. Never downloads.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'lib\FlutterExam.ps1')
. (Join-Path $PSScriptRoot 'lib\FieldTrial.ps1')
. (Join-Path $PSScriptRoot 'lib\BundleSetup.ps1')
function Write-Step([string]$text) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $text" }

$Output = [IO.Path]::GetFullPath($Output)
# Only (re)build into a new folder or one that this script created before.
if ((Test-Path -LiteralPath $Output) -and @(Get-ChildItem -LiteralPath $Output -Force).Count -and !(Test-Path -LiteralPath (Join-Path $Output 'bundle-manifest.json'))) {
  throw "Thư mục đích đã có dữ liệu không phải bộ cài: $Output"
}

Write-Step 'Kiểm tra kit Flutter theo manifest...'
$kitCheck = Test-KitIntegrity $PSScriptRoot
if (!$kitCheck.ok) { throw "Kit Flutter không nguyên vẹn: $($kitCheck.problems -join '; ')" }

Write-Step 'Kiểm tra bộ cài LM Studio, runtime và model theo manifest (mã băm)...'
$lmManifest = [IO.File]::ReadAllText((Join-Path $LmKit 'manifest.json')) | ConvertFrom-Json
$lmFiles = @($lmManifest.files | Where-Object { $_.path -match '^(installer/LM-Studio-Windows-x64\.exe|runtime/|models/|MODEL-LICENSE\.txt|MODEL-SOURCES\.md)' })
if (!@($lmFiles | Where-Object { $_.path -like 'installer/*' }).Count -or @($lmFiles | Where-Object { $_.path -like 'models/*' }).Count -lt 2 -or !@($lmFiles | Where-Object { $_.path -like 'runtime/*' }).Count) {
  throw 'Manifest của kit LM Studio thiếu bộ cài, runtime hoặc model.'
}
foreach ($f in $lmFiles) {
  $src = Join-Path $LmKit $f.path.Replace('/', '\')
  if (!(Test-Path -LiteralPath $src)) { throw "Thiếu $($f.path) trong kit LM Studio" }
  if ((Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.sha256) { throw "Sai mã băm: $($f.path)" }
}

Write-Step "Chép vào $Output ..."
New-Item -ItemType Directory -Force -Path $Output | Out-Null
foreach ($f in $lmFiles) {
  $dest = Join-Path $Output ('lmstudio\' + $f.path.Replace('/', '\'))
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  if (!(Test-Path -LiteralPath $dest) -or (Get-Item -LiteralPath $dest).Length -ne [long]$f.bytes -or (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.sha256) {
    Copy-Item -LiteralPath (Join-Path $LmKit $f.path.Replace('/', '\')) -Destination $dest -Force
  }
}
# Kit: everything except machine-local session, draft and result data. robocopy /MIR keeps reruns incremental.
$kitDest = Join-Path $Output 'kit'
$null = & robocopy $PSScriptRoot $kitDest /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 /XD (Join-Path $PSScriptRoot 'sessions') (Join-Path $PSScriptRoot 'drafts') (Join-Path $PSScriptRoot 'tests\results') (Join-Path $PSScriptRoot 'bundle-template')
if ($LASTEXITCODE -ge 8) { throw "robocopy lỗi (mã $LASTEXITCODE) khi chép kit" }
foreach ($name in @('Setup-And-Run.ps1', 'CHAY-DE-THI.cmd', 'DOC-TRUOC.md')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "bundle-template\$name") -Destination (Join-Path $Output $name) -Force
}
# Old verification marker would refer to the previous manifest.
Remove-Item -LiteralPath (Join-Path $Output 'logs\verified.json') -ErrorAction SilentlyContinue

Write-Step 'Ghi bundle-manifest.json...'
$base = $Output.TrimEnd('\') + '\'
$entries = Get-ChildItem -LiteralPath $Output -File -Recurse -Force | Where-Object {
  $r = $_.FullName.Substring($base.Length).Replace('\', '/')
  $r -ne 'bundle-manifest.json' -and $r -notmatch '^(logs|kit/sdk)/'
} | Sort-Object FullName | ForEach-Object {
  [ordered]@{ path=$_.FullName.Substring($base.Length).Replace('\', '/'); bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$sdk = Get-FolderSummary (Join-Path $kitDest 'sdk')
$manifest = [ordered]@{
  schema = 1; built = (Get-Date -Format 's'); flutterSdk = '3.47.8'; lmStudioRuntime = "$($script:BundleRuntimeName)@$($script:BundleRuntimeVersion)"; model = $script:BundleModelId
  files = @($entries); trees = @([ordered]@{ path='kit/sdk'; files=$sdk.files; bytes=$sdk.bytes })
}
[IO.File]::WriteAllText((Join-Path $Output 'bundle-manifest.json'), (ConvertTo-Json $manifest -Depth 5), [Text.UTF8Encoding]::new($false))
$total = (Get-FolderSummary $Output)
Write-Step ("Xong: {0} file đã băm + kit/sdk {1} file; tổng {2:n2} GB. Kiểm tra lại..." -f $entries.Count, $sdk.files, ($total.bytes / 1GB))
$verify = Test-BundleManifest $Output -Full
if (!$verify.ok) { throw "Bộ cài vừa build không khớp manifest: $($verify.problems -join '; ')" }
Write-Step "Bộ cài hợp lệ: $Output"
