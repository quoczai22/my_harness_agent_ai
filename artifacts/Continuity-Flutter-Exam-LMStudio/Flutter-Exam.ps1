param([switch]$SelfTest, [switch]$Live)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'lib\FlutterExam.ps1')
Import-LmConfig (Join-Path $PSScriptRoot 'config.json')

if ($SelfTest) {
  & (Join-Path $PSScriptRoot 'tests\Test-FlutterExam.ps1') -Live:$Live
  return
}

function Show-Help {
  Write-Host @'
Lệnh:
  /new       tạo phiên mới cho một bài (chọn thư mục project Flutter)
  /open      mở lại phiên cũ          /sessions  liệt kê phiên
  /pdf       đọc đề từ file PDF (xem lại rồi xác nhận)
  /exam      dán đề bằng chữ (nhiều lần được), kết thúc bằng dòng HET DE
  /screens   xác nhận tên các màn hình đề yêu cầu (vd: LoginScreen, HomeScreen)
  /files     file kit đọc được   /summary  package, dependencies, lớp, route
  /ask       hỏi, trả lời ngay trên chat
  /file      sinh một file lib/**.dart, test/**.dart; chỉ lưu bản nháp khi gõ SAVE
  /drafts    liệt kê bản nháp     /check  đối chiếu checklist
  /analyze   flutter analyze trên bản sao tạm (cần Flutter SDK)
  /status    trạng thái LM Studio  /help  /exit
'@
}
function Confirm-ExamText($s, [string]$text, $source) {
  Write-Host "`n----- NỘI DUNG ĐỀ ĐỌC ĐƯỢC -----`n$text`n--------------------------------"
  $choice = (Read-Host 'Dùng nội dung này làm đề? YES = dùng, EDIT = dán bản sửa, NO = bỏ').Trim().ToUpperInvariant()
  if ($choice -eq 'EDIT') {
    Write-Host 'Dán toàn bộ đề đã sửa; kết thúc bằng một dòng HET DE.'
    $text = Read-ExamText { [Console]::ReadLine() }
  } elseif ($choice -ne 'YES') { Write-Host 'Chưa lưu đề.'; return }
  Set-ExamText $s $text
  $s.pdf = $source; Save-Session $s
  Write-Host "Đã lưu đề: $($s.exam.Length) ký tự. Dùng /screens để xác nhận các màn hình."
}

if (!(Test-Utf8RoundTrip)) { Write-Host 'Cảnh báo: UTF-8 không hoạt động đúng trên máy này.' }
if ([Console]::OutputEncoding.CodePage -ne 65001) { Write-Host 'Cảnh báo: cửa sổ không dùng UTF-8. Hãy mở bằng Start-Flutter-Exam.cmd.' }
Write-Host 'Flutter Exam — đề PDF, sinh file Dart qua LM Studio (offline). Gõ /help để xem lệnh.'
$lm = $null
try { $lm = Initialize-LmStudio; Write-Host "LM Studio: $($lm.id), ngữ cảnh $($lm.context), đọc ảnh: $(if ($lm.vision) { 'có' } else { 'không' })" }
catch { Write-Host "LM Studio chưa sẵn sàng: $($_.Exception.Message)" }
$session = $null
while ($true) {
  try {
    $cmd = (Read-Host 'flutter').Trim()
    if ($cmd -eq '/exit') { break }
    if ($cmd -eq '/help' -or !$cmd) { Show-Help; continue }
    if ($cmd -eq '/status') { $lm = Initialize-LmStudio; Write-Host "LM Studio: $($lm.id), nạp: $($lm.loaded), ngữ cảnh $($lm.context), đọc ảnh: $($lm.vision)"; continue }
    if ($cmd -eq '/new') { $session = New-Session (Read-Host 'Thư mục project Flutter'); Write-Host "Phiên: $($session.id)"; continue }
    if ($cmd -eq '/sessions') { Get-SessionList | ForEach-Object { Write-Host "$($_.id)  $($_.project)  $($_.exam)" }; continue }
    if ($cmd -eq '/open') { $session = Open-Session (Read-Host 'Mã phiên'); Write-Host "Đã mở: $($session.id) — $($session.project)"; continue }
    if ($null -eq $session) { Write-Host 'Dùng /new hoặc /open trước.'; continue }
    if ($cmd -eq '/pdf') {
      $path = Read-Host 'Đường dẫn file PDF đề bài'
      $transcribe = $null
      if ($lm -and $lm.vision) { $transcribe = { param($image) Invoke-PageTranscription $image } }
      Write-Host 'Đang đọc PDF...'
      $result = Import-ExamPdf $path $transcribe
      if ($result.ocrPages.Count) { Write-Host "Trang $($result.ocrPages -join ', ') là ảnh scan: model đã đọc từ ảnh, có thể sai — kiểm tra kỹ." }
      if ($result.unsupportedPages.Count) { Write-Host "Trang $($result.unsupportedPages -join ', ') là ảnh scan và model hiện tại không đọc ảnh được." }
      Confirm-ExamText $session $result.text ([pscustomobject]@{ name=$result.name; sha256=$result.sha256; ocrPages=$result.ocrPages })
      continue
    }
    if ($cmd -eq '/exam') {
      Write-Host 'Dán chữ đề; kết thúc bằng một dòng chỉ có HET DE.'
      Set-ExamText $session (Read-ExamText { [Console]::ReadLine() }) -Append
      Write-Host "Đã lưu đề: $($session.exam.Length) ký tự."; continue
    }
    if ($cmd -eq '/screens') {
      $project = Get-ProjectModel $session
      $existing = @(Get-DartClasses $project.dart | Where-Object { $_.base -match '^(StatelessWidget|StatefulWidget)$' } | ForEach-Object { $_.name })
      if ($existing.Count) { Write-Host "Widget đang có: $($existing -join ', ')" }
      $names = @((Read-Host 'Tên lớp các màn hình, cách nhau dấu phẩy') -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      $bad = @($names | Where-Object { $_ -notmatch '^[A-Z]\w*$' })
      if ($bad.Count) { throw "Tên lớp không hợp lệ: $($bad -join ', ')" }
      $session.screens = $names; Save-Session $session; Write-Host "Đã lưu $($names.Count) màn hình."; continue
    }
    if ($cmd -eq '/files') { Get-ProjectFiles $session.project | ForEach-Object { Write-Host "$($_.rel)$(if ($_.kind -eq 'asset') { '  (asset)' })" }; continue }
    if ($cmd -eq '/summary') { Write-Host (Get-ProjectSummary (Get-ProjectModel $session)); continue }
    if ($cmd -eq '/drafts') { Get-DraftFiles $session | ForEach-Object { Write-Host $_.full }; continue }
    if ($cmd -eq '/check') { Write-Host (Format-Checklist (Test-FlutterChecklist $session)); continue }
    if ($cmd -eq '/analyze') {
      $result = Invoke-SafeAnalyze $session
      Write-Host $result.summary
      if ($result.tested) { $session.lastAnalyze = [pscustomobject]@{ at=(Get-Date -Format 's'); ok=$result.ok }; Save-Session $session }
      continue
    }
    if ($cmd -eq '/ask') {
      $question = Read-Host 'Câu hỏi'
      $timer = [Diagnostics.Stopwatch]::StartNew()
      $answer = Get-ChatAnswer (Get-Prompt $session $question) 1500
      Write-Host ("`nAI ({0:n0}s):`n{1}`n" -f $timer.Elapsed.TotalSeconds, $answer)
      Add-SessionHistory $session $question $answer; continue
    }
    if ($cmd -eq '/file') {
      if (!$session.exam) { throw 'Đưa đề vào bằng /pdf hoặc /exam trước khi sinh file.' }
      $rel = (Read-Host 'Đường dẫn trong project, ví dụ lib/screens/login_screen.dart').Trim().Replace('\','/')
      if (!(Test-SafeDraftPath $rel)) { throw 'Chỉ nhận lib/**.dart, test/**.dart hoặc assets/**.json.' }
      $project = Get-ProjectModel $session
      $exists = @($project.files | Where-Object { $_.rel -eq $rel }).Count -gt 0
      $samples = @(Find-JsonSamples $session.exam)
      if ($rel -match '^lib/models/(\w+)\.dart$' -and $samples.Count) {
        for ($i = 0; $i -lt $samples.Count; $i++) { $preview = ($samples[$i].text -replace '\s+',' '); Write-Host "[$($i + 1)] $(if ($preview.Length -gt 90) { $preview.Substring(0,90) + '...' } else { $preview })" }
        $pick = if ($samples.Count -eq 1) { 1 } else { [int](Read-Host 'Chọn số mẫu JSON (0 = để AI viết)') }
        if ($pick -ge 1 -and $pick -le $samples.Count) {
          $defaultName = ConvertTo-PascalCase ([regex]::Match($rel, '^lib/models/(\w+)\.dart$').Groups[1].Value)
          $className = (Read-Host "Tên lớp (Enter = $defaultName)").Trim()
          if (!$className) { $className = $defaultName }
          if ($className -notmatch '^[A-Z]\w*$') { throw "Tên lớp không hợp lệ: $className" }
          $code = New-DartModelCode $className $samples[$pick - 1].value
          Write-Host 'Sinh model từ mẫu JSON trong đề (không dùng AI).'
        }
      }
      if (!$code -and $rel -eq 'lib/main.dart' -and !$exists) {
        $code = New-MainDartCode $project @($session.screens) $project.package
        Write-Host 'Sinh main.dart từ danh sách màn hình đã xác nhận (không dùng AI).'
      }
      if (!$code) {
        $request = Read-Host 'File này cần làm gì?'
        $prompt = Get-Prompt $session "Chỉ viết toàn bộ nội dung file $rel bằng Dart/Flutter, không giải thích, không Markdown. $request" $rel
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $repaired = Repair-DartCode (Remove-CodeFence (Invoke-LmChat $script:SystemPrompt $prompt 3000)) $rel $project
        Write-Host ("Model: {0:n0}s" -f $timer.Elapsed.TotalSeconds)
        $code = $repaired.code
        $repaired.fixes | ForEach-Object { Write-Host "Đã sửa tự động: $_" }
        $fromModel = $true
      }
      $compileNote = ''
      if ($rel -match '\.dart$' -and (Get-AnalyzePlan $session).canRun) {
        Write-Host 'Đang kiểm tra biên dịch (dart analyze, offline)...'
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $checked = Repair-WithAnalyzer $session $rel $code -Rounds $(if ($fromModel) { 2 } else { 0 })
        $code = $checked.code
        $checked.quickFixes | ForEach-Object { Write-Host "Sửa nhanh theo lỗi biên dịch: $_" }
        if ($checked.history.Count -gt 1) { Write-Host ("Tự sửa theo lỗi biên dịch: {0} lỗi ({1:n0}s)" -f ($checked.history -join ' -> '), $timer.Elapsed.TotalSeconds) }
        $compileNote = if (!$checked.tested) { "Chưa kiểm biên dịch: $($checked.note)" }
          elseif ($checked.errors.Count) { "CÒN $($checked.errors.Count) LỖI BIÊN DỊCH trong file này:`n" + (($checked.errors | Select-Object -First 10 | ForEach-Object { "  dòng $($_.line): $($_.message)" }) -join "`n") }
          else { 'Biên dịch: không có lỗi trong file này (dart analyze).' }
      }
      $fromModel = $false
      Write-Host "`nĐỀ XUẤT ${rel}:`n$code`n"
      if ($compileNote) { Write-Host "$compileNote`n" }
      $answer = Read-Host 'Gõ SAVE để lưu bản nháp riêng'
      if ($answer -cne 'SAVE') { $code = $null; continue }
      $replace = $false
      if (Test-Path -LiteralPath (Get-DraftPath $session $rel)) {
        if ((Read-Host 'Bản nháp này đã có. Gõ REPLACE để thay') -cne 'REPLACE') { $code = $null; continue }
        $replace = $true
      }
      $target = Save-Draft $session $rel $code -Replace:$replace
      $code = $null
      Write-Host "Đã lưu bản nháp: $target (chưa phân tích, chưa chạy)"
      continue
    }
    Write-Host 'Lệnh không hợp lệ. Gõ /help.'
  } catch { $code = $null; $fromModel = $false; Write-Host "Lỗi: $($_.Exception.Message)" }
}
