# Maintainer helper: rewrite manifest.json after changing kit files.
# Large or machine-local folders are excluded; the bundled SDK is described by version and archive hash instead.
$ErrorActionPreference = 'Stop'
$kit = $PSScriptRoot
$base = $kit.TrimEnd('\') + '\'
$old = [IO.File]::ReadAllText((Join-Path $kit 'manifest.json')) | ConvertFrom-Json
$files = Get-ChildItem -LiteralPath $kit -File -Recurse -Force | Where-Object {
  $r = $_.FullName.Substring($base.Length).Replace('\', '/')
  $r -ne 'manifest.json' -and $r -notmatch '^(sdk|sessions|drafts|tests/results|bundle-template)/'
} | Sort-Object FullName | ForEach-Object {
  [ordered]@{ path=$_.FullName.Substring($base.Length).Replace('\', '/'); bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$pkgs = @(Get-ChildItem -LiteralPath (Join-Path $kit 'sdk\pub-cache\hosted\pub.dev') -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '.cache' } | ForEach-Object { $_.Name })
$manifest = [ordered]@{ schema=1; kit=$old.kit; requires=$old.requires; flutterSdk=$old.flutterSdk; pubCache=[ordered]@{ path='sdk/pub-cache'; packages=$pkgs }; files=@($files) }
[IO.File]::WriteAllText((Join-Path $kit 'manifest.json'), (ConvertTo-Json $manifest -Depth 6), [Text.UTF8Encoding]::new($false))
Write-Host "manifest.json: $(@($files).Count) file, $($pkgs.Count) package."
