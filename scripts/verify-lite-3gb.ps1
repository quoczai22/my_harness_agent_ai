param([string]$KitRoot = 'D:\harness_agent\artifacts\Continuity-Lite-Terminal-Kit-3GB')

$ErrorActionPreference = 'Stop'
$kit = (Resolve-Path -LiteralPath $KitRoot).Path
$run = [Guid]::NewGuid().ToString('N')
$docx = Join-Path $env:TEMP ("continuity-$run.docx")
$pdf = Join-Path $env:TEMP ("continuity-$run.pdf")
$python = Join-Path $env:TEMP ("continuity-$run.py")
$prompt = Join-Path $env:TEMP ("continuity-$run.prompt.txt")
$results = [System.Collections.Generic.List[string]]::new()

function Check([string]$name, [bool]$condition) {
  if (!$condition) { throw "FAIL: $name" }
  $results.Add("PASS: $name")
  Write-Output "PASS: $name"
}

function New-Pdf([string]$path) {
  $stream = "BT /F1 12 Tf 72 720 Td (Bai 1 cau 1: What is 2 plus 2?) Tj ET"
  $objects = @(
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ("<< /Length {0} >>`nstream`n{1}`nendstream" -f $stream.Length, $stream)
  )
  $body = "%PDF-1.4`n"
  $offsets = @(0)
  for ($i = 0; $i -lt $objects.Count; $i++) {
    $offsets += [Text.Encoding]::ASCII.GetByteCount($body)
    $body += ("{0} 0 obj`n{1}`nendobj`n" -f ($i + 1), $objects[$i])
  }
  $xref = [Text.Encoding]::ASCII.GetByteCount($body)
  $body += "xref`n0 6`n0000000000 65535 f `n"
  foreach ($offset in $offsets[1..5]) { $body += ("{0:D10} 00000 n `n" -f $offset) }
  $body += "trailer`n<< /Size 6 /Root 1 0 R >>`nstartxref`n$xref`n%%EOF`n"
  [IO.File]::WriteAllBytes($path, [Text.Encoding]::ASCII.GetBytes($body))
}

try {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::Open($docx, [IO.Compression.ZipArchiveMode]::Create)
  try {
    $entry = $zip.CreateEntry('word/document.xml')
    $writer = [IO.StreamWriter]::new($entry.Open())
    try {
      $writer.Write('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Bai 1 cau 1: 2 plus 2 equals how many?</w:t></w:r></w:p><w:p><w:r><w:t>Bai 1 cau 2: 3 plus 3 equals how many?</w:t></w:r></w:p></w:body></w:document>')
    } finally { $writer.Dispose() }
  } finally { $zip.Dispose() }
  New-Pdf $pdf
  [IO.File]::WriteAllText($python, 'print(2 + 2)', [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($prompt, 'What is 2+2? Reply with one number.', [Text.UTF8Encoding]::new($false))

  $model = & (Join-Path $kit 'Get-Selected-Model.ps1')
  Check 'one local model' ((@(Get-ChildItem -LiteralPath (Join-Path $kit 'models') -Filter '*.gguf' -File).Count -eq 1) -and $model.StartsWith($kit))
  for ($i = 1; $i -le 3; $i++) {
    $answer = (& (Join-Path $kit 'Get-Llama-Answer.ps1') -Model $model -PromptFile $prompt -Context 512 -MaxTokens 20 | Out-String).Trim()
    Check "model inference $i/3" ($answer -match '\b4\b' -and $answer -notmatch 'Loading model|available commands')
  }

  $extract = Join-Path $env:TEMP ("continuity-$run-pdf.txt")
  & (Join-Path $kit 'tools\pdf\pdftotext.exe') -layout $pdf $extract
  Check 'PDF text extraction' ((Get-Content -LiteralPath $extract -Raw) -match '2 plus 2')

  for ($i = 1; $i -le 2; $i++) {
    $word = (& cmd.exe /d /c "echo exit| powershell -NoProfile -ExecutionPolicy Bypass -File `"$kit\Read-Word.ps1`" -DocxPath `"$docx`" -Question `"Bai 1 cau 1`"" 2>&1 | Out-String)
    Check "Word document answer $i/2" (($word -split 'AI:').Count -ge 2 -and $word -match '\b4\b' -and $word -notmatch 'DOCUMENT TEXT|Loading model|available commands')
  }
  for ($i = 1; $i -le 2; $i++) {
    $pdfAnswer = (& (Join-Path $kit 'Read-PDF.ps1') -PdfPath $pdf 2>&1 | Out-String)
    Check "PDF answer $i/2" ($pdfAnswer -match '\b4\b' -and $pdfAnswer -notmatch 'DOCUMENT TEXT|Loading model|available commands')
  }
  for ($i = 1; $i -le 2; $i++) {
    $review = (& (Join-Path $kit 'Review-File.ps1') -PythonPath $python 2>&1 | Out-String)
    if ($review -notmatch 'print|code') { Write-Output "DEBUG Python review ${i}: $review" }
    Check "Python review $i/2" ($review -match 'print|code' -and $review -notmatch 'Loading model|available commands')
  }
  for ($i = 1; $i -le 2; $i++) {
    $chat = (& cmd.exe /d /c "(echo /exit& echo.)| call `"$kit\Start-Chat.cmd`"" 2>&1 | Out-String)
    Check "chat launcher $i/2" ($chat -match [regex]::Escape([IO.Path]::GetFileName($model)) -and $chat -notmatch 'invalid argument')
  }
  Write-Output ("RESULT: {0} checks passed" -f $results.Count)
} finally {
  foreach ($file in @($docx, $pdf, $python, $prompt, (Join-Path $env:TEMP "continuity-$run-pdf.txt"))) {
    Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue
  }
  foreach ($dir in @('documents','pdf')) {
    $sessionDir = Join-Path $kit ("sessions\$dir")
    Get-ChildItem -LiteralPath $sessionDir -File -Filter "continuity-$run*" -ErrorAction SilentlyContinue | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -ErrorAction SilentlyContinue
    }
  }
}
