param([Parameter(Mandatory=$true)][string]$PythonPath)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (!(Test-Path -LiteralPath $PythonPath) -or [IO.Path]::GetExtension($PythonPath).ToLowerInvariant() -ne '.py') {
  throw 'Choose an existing .py file.'
}
$model = & (Join-Path $root 'Get-Selected-Model.ps1')
$code = Get-Content -LiteralPath $PythonPath -Raw
if ($code.Length -gt 16000) { $code = $code.Substring(0, 16000) + "`n[File excerpt truncated.]" }
$prompt = "Review this Python file in Vietnamese. Check correctness, edge cases, input validation, output format, readability, and whether the code matches the likely exercise requirement. Give concrete improvements with small examples when useful. Do not claim to edit the file. Return only the review, without repeating the complete source code.`n`nFILE: $PythonPath`n`nCODE:`n$code"
$dir = Join-Path $root 'sessions\reviews'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$promptFile = Join-Path $dir ([Guid]::NewGuid().ToString('N') + '.prompt.txt')
try {
  [IO.File]::WriteAllText($promptFile, $prompt, [Text.UTF8Encoding]::new($false))
  & (Join-Path $root 'Get-Llama-Answer.ps1') -Model $model -PromptFile $promptFile -Context 8192 -MaxTokens 1024
} finally {
  Remove-Item -LiteralPath $promptFile -ErrorAction SilentlyContinue
}
