# Setup steps for the one-click Flutter exam bundle. Dot-source after LmStudio.ps1.
# Each Test-* reports whether a step is already done, so the launcher can be re-run safely.

$script:BundleRuntimeName = 'llama.cpp-win-x86_64-avx2'
$script:BundleRuntimeVersion = '2.62.1'
$script:BundleModelId = 'qwen3.5-2b'

if (-not ('KitBundle.CpuFeatures' -as [type])) {
  Add-Type -Namespace 'KitBundle' -Name 'CpuFeatures' -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(int feature);'
}

function Get-LmStudioCandidates {
  return @(
    (Join-Path $env:LOCALAPPDATA 'Programs\LM Studio\LM Studio.exe'),
    (Join-Path $env:ProgramFiles 'LM Studio\LM Studio.exe')
  )
}
function Find-LmStudioExe([string[]]$Candidates = (Get-LmStudioCandidates)) {
  return @($Candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1)[0]
}
function Get-LmStudioInstallerArguments {
  # electron-builder NSIS: silent, per-user install into %LOCALAPPDATA%\Programs (no admin rights).
  return @('/S', '/currentuser')
}
function Get-LmStudioHome([string]$UserProfile = $env:USERPROFILE) { return (Join-Path $UserProfile '.lmstudio') }
function Get-LmsExe([string]$LmHome = (Get-LmStudioHome)) { return (Join-Path $LmHome 'bin\lms.exe') }

function Test-RuntimeListed([string]$runtimeList) {
  return [regex]::IsMatch($runtimeList, [regex]::Escape("$($script:BundleRuntimeName)@$($script:BundleRuntimeVersion)"))
}
function Test-GgufEngineSelected([string]$runtimeList) {
  # "lms runtime ls" marks the selected engine of each format with a check mark in the SELECTED column.
  return [regex]::IsMatch($runtimeList, '(?m)^\S+@\S+\s+' + [char]0x2713 + '\s+GGUF\b')
}

function ConvertTo-JsonString([string]$value) {
  return '"' + $value.Replace('\', '\\').Replace('"', '\"') + '"'
}
function Get-ModelsFolderSetting([string]$settingsPath) {
  if (!(Test-Path -LiteralPath $settingsPath)) { return $null }
  $raw = [IO.File]::ReadAllText($settingsPath)
  try { return [string]($raw | ConvertFrom-Json).downloadsFolder } catch { return $null }
}
function Set-ModelsFolderSetting([string]$settingsPath, [string]$folder) {
  # Edits only the "downloadsFolder" value with a text replacement so the rest of LM Studio's file keeps its
  # exact formatting. The original is backed up once per change.
  $folder = [IO.Path]::GetFullPath($folder).TrimEnd('\')
  if (!(Test-Path -LiteralPath $settingsPath)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $settingsPath -Parent) | Out-Null
    [IO.File]::WriteAllText($settingsPath, "{`n  ""downloadsFolder"": $(ConvertTo-JsonString $folder)`n}`n", [Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{ changed=$true; backup='' }
  }
  $current = Get-ModelsFolderSetting $settingsPath
  if ($current -and ([IO.Path]::GetFullPath($current).TrimEnd('\') -ieq $folder)) { return [pscustomobject]@{ changed=$false; backup='' } }
  $raw = [IO.File]::ReadAllText($settingsPath)
  try { $null = $raw | ConvertFrom-Json } catch { throw "settings.json của LM Studio không đọc được, không sửa: $settingsPath" }
  $backup = "$settingsPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $settingsPath -Destination $backup
  $value = ConvertTo-JsonString $folder
  $pattern = '"downloadsFolder"\s*:\s*"(?:[^"\\]|\\.)*"'
  # Instance Replace: the static overload has no count argument (a trailing 1 would mean RegexOptions.IgnoreCase).
  $updated = if ([regex]::IsMatch($raw, $pattern)) { ([regex]$pattern).Replace($raw, [Text.RegularExpressions.MatchEvaluator]{ param($m) '"downloadsFolder": ' + $value }, 1) }
    else { ([regex]'^\s*\{').Replace($raw, [Text.RegularExpressions.MatchEvaluator]{ param($m) $m.Value + "`n  ""downloadsFolder"": $value," }, 1) }
  $null = $updated | ConvertFrom-Json
  [IO.File]::WriteAllText($settingsPath, $updated, [Text.UTF8Encoding]::new($false))
  return [pscustomobject]@{ changed=$true; backup=$backup }
}

# ---------------------------------------------------------------- bundle manifest

function Get-FolderSummary([string]$folder) {
  $files = @(Get-ChildItem -LiteralPath $folder -File -Recurse -Force -ErrorAction SilentlyContinue)
  return [pscustomobject]@{ files=$files.Count; bytes=[long](($files | Measure-Object Length -Sum).Sum) }
}
function Test-BundleManifest([string]$root, [switch]$Full) {
  # Fast mode checks presence and size; full mode also checks SHA-256. Large trees are compared by count/bytes.
  $manifestPath = Join-Path $root 'bundle-manifest.json'
  if (!(Test-Path -LiteralPath $manifestPath)) { return [pscustomobject]@{ ok=$false; problems=@('thiếu bundle-manifest.json') } }
  $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
  $problems = [Collections.Generic.List[string]]::new()
  foreach ($f in @($manifest.files)) {
    $path = Join-Path $root $f.path.Replace('/', '\')
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { $problems.Add("thiếu $($f.path)"); continue }
    if ((Get-Item -LiteralPath $path).Length -ne [long]$f.bytes) { $problems.Add("sai kích thước $($f.path)"); continue }
    if ($Full -and (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.sha256) { $problems.Add("sai mã băm $($f.path)") }
  }
  foreach ($t in @($manifest.trees)) {
    $sum = Get-FolderSummary (Join-Path $root $t.path.Replace('/', '\'))
    if ($sum.files -ne [int]$t.files -or $sum.bytes -ne [long]$t.bytes) { $problems.Add("thư mục $($t.path) khác ($($sum.files) file/$($sum.bytes) byte, cần $($t.files)/$($t.bytes))") }
  }
  return [pscustomobject]@{ ok=!$problems.Count; problems=@($problems | Select-Object -First 15) }
}
