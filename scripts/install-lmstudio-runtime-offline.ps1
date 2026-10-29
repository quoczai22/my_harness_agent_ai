param(
  [Parameter(Mandatory=$true)][string]$KitRoot
)

$ErrorActionPreference = 'Stop'
$LmStudioHome = Join-Path $env:USERPROFILE '.lmstudio'
$kit = (Resolve-Path -LiteralPath $KitRoot).Path
& (Join-Path $kit 'verify-lmstudio-kit.ps1') -KitRoot $kit
$source = Join-Path $kit 'runtime/llama.cpp-win-x86_64-avx2-2.62.1'
$manifest = Join-Path $source 'backend-manifest.json'
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { throw 'CPU runtime manifest missing.' }
$metadata = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
if ($metadata.name -ne 'llama.cpp-win-x86_64-avx2' -or $metadata.version -ne '2.62.1' -or $metadata.platform -ne 'win' -or -not ($metadata.cpu.instruction_set_extensions -contains 'AVX2')) { throw 'Bundled runtime metadata is incompatible with this kit.' }
if (-not (Get-Command lms -ErrorAction SilentlyContinue)) { throw 'Install LM Studio Desktop first; lms CLI is not available.' }
$backends = Join-Path $LmStudioHome 'extensions/backends'
New-Item -ItemType Directory -Path $backends -Force | Out-Null
$destination = Join-Path $backends 'llama.cpp-win-x86_64-avx2-2.62.1'
if (-not (Test-Path -LiteralPath $destination)) {
  Copy-Item -LiteralPath $source -Destination $destination -Recurse
}
foreach ($file in @(Get-ChildItem -LiteralPath $source -Recurse -File)) {
  $relativePath = $file.FullName.Substring($source.Length).TrimStart('\')
  $target = Join-Path $destination $relativePath
  if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw "Runtime file mismatch: $relativePath" }
}
$installed = (& lms runtime ls | Out-String)
if ($LASTEXITCODE -ne 0 -or $installed -notmatch 'llama\.cpp-win-x86_64-avx2@2\.62\.1') { throw 'Runtime files copied but LM Studio does not recognize the CPU runtime. This target is not accepted.' }
Write-Output 'Offline CPU runtime staged and recognized by LM Studio. AVX2 execution and 8 GB memory still require a model load test on this PC.'
