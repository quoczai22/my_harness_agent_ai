param(
  [string]$Pdf = '',
  [string]$Transcript = '',
  [switch]$PhonePhoto,
  [string]$Screen = '',
  [switch]$SkipModel
)
# Field trial: measures this PC running the kit end to end and writes a report.
# Everything it creates stays in tests\results\trial-<time>\ (ignored by git); the user's projects are never touched.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'lib\FlutterExam.ps1')
. (Join-Path $PSScriptRoot 'lib\FieldTrial.ps1')
Import-LmConfig (Join-Path $PSScriptRoot 'config.json')

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$trialDir = Join-Path $PSScriptRoot "tests\results\trial-$stamp"
New-Item -ItemType Directory -Force -Path $trialDir | Out-Null
$script:SessionDir = Join-Path $trialDir 'sessions'
$script:DraftRoot = Join-Path $trialDir 'drafts'
$phases = [Collections.Generic.List[object]]::new()
$notes = [Collections.Generic.List[string]]::new()
function Write-Step([string]$text) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $text" }

Write-Step 'Ghi điều kiện máy (chỉ đọc)...'
$machine = Get-MachineConditions
$network = Get-NetworkEvidence
$path = Get-PathEvidence
$kit = Test-KitIntegrity $PSScriptRoot

$lm = $null
if (!$SkipModel) {
  Write-Step 'Khởi động LM Studio và nạp model...'
  $p = Measure-TrialPhase 'Khởi động LM Studio + nạp model' { Initialize-LmStudio -Quiet }
  $phases.Add($p); $lm = $p.result
  if ($p.error) { $notes.Add("LM Studio: $($p.error)") }
}
$hasLm = [bool]($lm -and $lm.loaded)

$intake = $null
if ($Pdf) {
  Write-Step 'Đọc đề PDF...'
  $transcribe = if ($hasLm -and $lm.vision) { { param($img) Invoke-PageTranscription $img } } else { $null }
  $p = Measure-TrialPhase 'Đọc đề PDF (pdftotext + model đọc ảnh)' { Import-ExamPdf $Pdf $transcribe }
  $phases.Add($p); $intake = $p.result
  if ($p.error) { $notes.Add("Đọc PDF: $($p.error)") }
  if ($intake) { [IO.File]::WriteAllText((Join-Path $trialDir 'ocr-output.txt'), $intake.text, $script:Utf8) }
} else { $notes.Add('Không có -Pdf: bỏ qua bước đọc đề.') }

$ocr = $null; $truth = ''
if ($Transcript -and (Test-Path -LiteralPath $Transcript)) { $truth = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Transcript).Path) }
if ($truth -and $intake) {
  $ocrBody = [regex]::Replace($intake.text, '(?m)^\[Trang \d+[^\]\r\n]*\]\s*$', '')
  $ocr = Compare-Transcript $truth $ocrBody
} elseif (!$truth) { $notes.Add('Không có -Transcript (bản chép tay đã xác nhận): không đo được độ chính xác đọc ảnh.') }

$generation = $null
$examText = if ($truth) { $truth } elseif ($intake) { $intake.text } else { '' }
if ($hasLm -and $examText) {
  if (!$truth) { $notes.Add('Sinh code dùng chữ đọc từ PDF chưa được người xác nhận.') }
  $project = Join-Path $trialDir 'project'
  New-Item -ItemType Directory -Force -Path $project | Out-Null
  Copy-Item -Path (Join-Path $PSScriptRoot 'tests\fixtures\empty-app\*') -Destination $project -Recurse
  $pub = Join-Path $project 'pubspec.yaml'
  [IO.File]::WriteAllText($pub, ([IO.File]::ReadAllText($pub) -replace '(?m)^name: \w+', 'name: trial_app'))
  $s = New-Session $project
  Set-ExamText $s $examText
  if (!$Screen) { $Screen = @([regex]::Matches($examText, '\b[A-Z]\w*Screen\b') | ForEach-Object { $_.Value } | Select-Object -First 1)[0] }
  if ($Screen) {
    $s.screens = @([regex]::Matches($examText, '\b[A-Z]\w*Screen\b') | ForEach-Object { $_.Value } | Select-Object -Unique)
    if ($s.screens -notcontains $Screen) { $s.screens = @($Screen) + @($s.screens) }
    Save-Session $s
    $samples = @(Find-JsonSamples $examText)
    if ($samples.Count) { try { Save-Draft $s 'lib/models/exam_model.dart' (New-DartModelCode 'ExamModel' $samples[0].value) | Out-Null } catch { $notes.Add("Model JSON: $($_.Exception.Message)") } }
    $rel = "lib/screens/$(ConvertTo-SnakeCase $Screen).dart"
    Write-Step "Sinh $rel và kiểm tra biên dịch..."
    $p = Measure-TrialPhase "Sinh $rel + biên dịch/tự sửa" {
      $candidate = Get-DartCodeCandidate (Invoke-LmCode $script:SystemPrompt (Get-Prompt $s "Chỉ viết toàn bộ nội dung file $rel bằng Dart/Flutter, không giải thích, không Markdown. Màn hình $Screen theo đúng đề." $rel) 3000)
      if ($candidate.incomplete) { return [pscustomobject]@{ incomplete=$true; note=$candidate.note; code=$candidate.code } }
      $repaired = Repair-DartCode $candidate.code $rel (Get-ProjectModel $s)
      Repair-WithAnalyzer $s $rel $repaired.code
    }
    $phases.Add($p); $generation = $p.result
    if ($generation -and $generation.code) { Save-Draft $s $rel $generation.code | Out-Null }
    Save-Draft $s 'lib/main.dart' (New-MainDartCode (Get-ProjectModel $s) @($s.screens) 'trial_app') | Out-Null
    $p = Measure-TrialPhase 'Phân tích toàn project (dart analyze)' { Invoke-SafeAnalyze $s }
    $phases.Add($p); $whole = $p.result
    $check = @(Test-FlutterChecklist $s)
  } else { $notes.Add('Không tìm thấy tên màn hình (…Screen) trong đề; truyền -Screen để thử sinh code.') }
} elseif (!$hasLm) { $notes.Add('Không có LM Studio/model: bỏ qua bước sinh code.') }

$verdict = Get-TrialVerdict $machine $network $path $kit ([bool]$PhonePhoto) ([bool]$truth) $hasLm
$r = [Collections.Generic.List[string]]::new()
$r.Add("# Báo cáo chạy thử kit Flutter — $(Get-Date -Format 's')"); $r.Add('')
$r.Add("**Trạng thái field trial: $($verdict.status.ToUpperInvariant())**$(if ($verdict.status -eq 'not run') { ' — thiếu ít nhất một điều kiện của máy đích bên dưới; số đo chỉ là chạy khô, không phải nghiệm thu.' } else { ' — mọi điều kiện máy đích đã được ghi nhận.' })"); $r.Add('')
$r.Add('## Điều kiện'); $r.Add('| Điều kiện | Đạt | Chi tiết |'); $r.Add('|---|---|---|')
$verdict.conditions | ForEach-Object { $r.Add("| $($_.item) | $(if ($_.met) { 'có' } else { '**không**' }) | $($_.detail) |") }
$r.Add(''); $r.Add("Máy: $($machine.os); CPU $($machine.cpu), $($machine.logicalCores) luồng; RAM $($machine.ramGB) GB (trống lúc đầu $($machine.freeRamGB) GB).")
$r.Add("Mạng: adapter đang bật: $(if ($network.adaptersUp.Count) { $network.adaptersUp -join '; ' } else { '(không)' }).")
if ($lm) { $r.Add("LM Studio: model $($lm.id), ngữ cảnh $($lm.context), đọc ảnh: $($lm.vision).") }
$r.Add(''); $r.Add('## Thời gian và bộ nhớ theo giai đoạn'); $r.Add('| Giai đoạn | Giây | RAM đỉnh (MB, các tiến trình LM Studio/dart/PowerShell) | RAM trống thấp nhất (MB) | Lỗi |'); $r.Add('|---|---|---|---|---|')
foreach ($p in $phases) {
  $by = ((@($p.peakByProcess.Keys) | Sort-Object | ForEach-Object { "$_ $($p.peakByProcess[$_])" }) -join ', ')
  $r.Add("| $($p.name) | $($p.seconds) | $([Math]::Round($p.peakTotalMB)) ($by) | $($p.minFreeMB) | $($p.error) |")
}
$r.Add(''); $r.Add('## Độ chính xác đọc đề')
if ($ocr) {
  $r.Add("- Tỉ lệ từ khớp: $($ocr.wordRecall)")
  $r.Add("- Chi tiết quan trọng đúng: $($ocr.factsFound)/$($ocr.factsTotal)$(if ($ocr.missing.Count) { ' — sai/thiếu: ' + ($ocr.missing -join '; ') })")
} else { $r.Add('- not run') }
if ($intake) { $r.Add("- Trang: $($intake.pages); trang đọc bằng model: $(@($intake.ocrPages) -join ', '); trang không đọc được: $(@($intake.unsupportedPages) -join ', ')") }
$r.Add(''); $r.Add('## Sinh code')
if ($generation) {
  if ($generation.incomplete) { $r.Add("- File bị cắt: $($generation.note)") }
  else {
    $r.Add("- Lỗi biên dịch qua các vòng: $(@($generation.history) -join ' -> '); sửa nhanh: $(@($generation.quickFixes).Count); còn lại: $(@($generation.errors).Count)")
    if (@($generation.validationIssues).Count) { $r.Add("- Thiếu yêu cầu Form: $(@($generation.validationIssues) -join ', ')") }
  }
  if ($whole) { $r.Add("- Toàn project: $(if (!$whole.tested) { 'chưa phân tích: ' + $whole.summary } elseif ($whole.ok) { 'không lỗi biên dịch' } else { 'có lỗi biên dịch' })") }
  if ($check) { $r.Add("- Checklist: $(@($check | Where-Object { $_.status -eq 'verified' }).Count) đạt, $(@($check | Where-Object { $_.status -eq 'failed' }).Count) lỗi") }
} else { $r.Add('- not run') }
$r.Add(''); $r.Add('## Ghi chú'); $notes | ForEach-Object { $r.Add("- $_") }
$r.Add('- Kit không chạy ứng dụng Flutter; hành vi app chưa được kiểm.')
$reportPath = Join-Path $trialDir 'report.md'
[IO.File]::WriteAllText($reportPath, ($r -join "`n"), $script:Utf8)
Write-Step "Trạng thái field trial: $($verdict.status). Báo cáo: $reportPath"
