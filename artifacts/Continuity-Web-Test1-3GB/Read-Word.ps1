param(
  [Parameter(Mandatory=$true)][string]$DocxPath,
  [string]$Question = ''
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$model = & (Join-Path $root 'Get-Selected-Model.ps1')
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

if (!(Test-Path -LiteralPath $DocxPath) -or [IO.Path]::GetExtension($DocxPath).ToLowerInvariant() -ne '.docx') {
  throw 'Choose an existing .docx file.'
}

$outDir = Join-Path $root 'sessions\documents'
New-Item -ItemType Directory -Force $outDir | Out-Null
$stem = [IO.Path]::GetFileNameWithoutExtension($DocxPath) -replace '[^a-zA-Z0-9._-]', '_'
$out = Join-Path $outDir ("{0}-{1}.txt" -f $stem, (Get-Date -Format 'yyyyMMdd-HHmmss'))

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($DocxPath)
try {
  $entry = $archive.GetEntry('word/document.xml')
  if ($null -eq $entry) { throw 'This .docx file has no readable main document content.' }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $archive.Dispose() }

$ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
$ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
$paragraphs = @($xml.SelectNodes('//w:body/w:p', $ns) | ForEach-Object { $_.InnerText.Trim() } | Where-Object { $_ })
$text = $paragraphs -join [Environment]::NewLine
if ([string]::IsNullOrWhiteSpace($text)) { throw 'No extractable text. This document may contain only images, scans, or unsupported embedded content.' }

[IO.File]::WriteAllText($out, $text, [Text.UTF8Encoding]::new($false))
$bounded = if ($text.Length -gt 16000) { $text.Substring(0, 16000) + "`n[Document excerpt truncated for this session.]" } else { $text }
$history = [System.Collections.Generic.List[string]]::new()
$nextQuestion = $Question

Write-Host "DOCX loaded. Ask one question at a time. Type exit or thoat to close this session."
while ($true) {
  if ([string]::IsNullOrWhiteSpace($nextQuestion)) {
    $nextQuestion = Read-Host 'Cau hoi (vi du Bai 1 cau 1)'
  }
  if ($nextQuestion -match '^(exit|thoat)$') { break }
  if ([string]::IsNullOrWhiteSpace($nextQuestion)) { continue }

  $historyText = (($history | Select-Object -Last 6) -join "`n`n")
  if ($historyText.Length -gt 8000) { $historyText = $historyText.Substring($historyText.Length - 8000) }
  $prompt = "You are an offline study assistant. Answer in Vietnamese using the document and the conversation from this terminal session.`n`nDOCUMENT TEXT:`n$bounded`n`nCONVERSATION HISTORY (earliest to latest):`n$historyText`n`nCURRENT USER QUESTION: $nextQuestion`n`nAnswer the current question only. For a follow-up such as 'why did you answer that?', explain the reasoning behind your previous answer using the previous user question and your previous answer; derive simple reasoning even when the document does not spell it out. For 'next question', find the next numbered item after the previous one in the document. If the document and conversation cannot support an answer, say what is missing. Do not repeat the full document or claim to edit files.`n`nANSWER:"
  $promptFile = Join-Path $outDir ("{0}-{1}.prompt.txt" -f $stem, [Guid]::NewGuid().ToString('N'))
  try {
    [IO.File]::WriteAllText($promptFile, $prompt, [Text.UTF8Encoding]::new($false))
    $answer = (& (Join-Path $root 'Get-Llama-Answer.ps1') -Model $model -PromptFile $promptFile).Trim()
  } finally {
    Remove-Item -LiteralPath $promptFile -ErrorAction SilentlyContinue
  }
  if ([string]::IsNullOrWhiteSpace($answer)) { $answer = 'Model did not return an answer. Try asking a shorter, more specific question.' }
  Write-Host "`nAI:`n$answer`n"
  $history.Add("USER: $nextQuestion`nASSISTANT: $answer")
  $nextQuestion = ''
}
