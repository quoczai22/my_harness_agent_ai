param([Parameter(Mandatory=$true)][string]$PdfPath)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$model = & (Join-Path $root 'Get-Selected-Model.ps1')
if (!(Test-Path -LiteralPath $PdfPath) -or [IO.Path]::GetExtension($PdfPath).ToLowerInvariant() -ne '.pdf') { throw 'Choose an existing .pdf file.' }
$outDir = Join-Path $root 'sessions\pdf'; New-Item -ItemType Directory -Force $outDir | Out-Null
$stem = [IO.Path]::GetFileNameWithoutExtension($PdfPath) -replace '[^a-zA-Z0-9._-]', '_'
$out = Join-Path $outDir ("{0}-{1}.txt" -f $stem, (Get-Date -Format 'yyyyMMdd-HHmmss'))
& (Join-Path $root 'tools\pdf\pdftotext.exe') -layout -- $PdfPath $out
if (!(Test-Path -LiteralPath $out)) { throw 'PDF text extraction did not create an output file.' }
$text = Get-Content -LiteralPath $out -Raw
if ([string]::IsNullOrWhiteSpace($text)) { throw "No extractable text. This PDF may be a scan/image and needs OCR or a vision model." }
$bounded = if ($text.Length -gt 24000) { $text.Substring(0,24000) + "`n[Text truncated; ask about this part first.]" } else { $text }
$prompt = "Read this extracted PDF text and answer in Vietnamese. If it is an exercise, explain the requirement and propose a solution. Do not claim to edit files.`n`nSOURCE: $PdfPath`n`n$bounded"
$promptFile = Join-Path $outDir ("{0}-{1}.prompt.txt" -f $stem, [Guid]::NewGuid().ToString('N'))
try {
  [IO.File]::WriteAllText($promptFile, $prompt, [Text.UTF8Encoding]::new($false))
  & (Join-Path $root 'Get-Llama-Answer.ps1') -Model $model -PromptFile $promptFile -Context 8192 -MaxTokens 2048
} finally {
  Remove-Item -LiteralPath $promptFile -ErrorAction SilentlyContinue
}
