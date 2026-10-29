param([switch]$SelfTest, [switch]$Live)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'lib\WebExam.ps1')

if ($SelfTest) {
  & (Join-Path $PSScriptRoot 'tests\Test-WebExam.ps1') -Live:$Live
  return
}

function Show-Help {
  Write-Host @'
Lệnh:
  /new       tạo phiên mới cho một bài (chọn thư mục project)
  /open      mở lại phiên cũ          /sessions  liệt kê phiên
  /exam      dán đề (có thể nhiều lần), kết thúc bằng dòng HET DE
  /view      đính kèm file .html/.cshtml mẫu (có thể nhiều file)
  /files     file mã nguồn kit đọc được   /schema  bảng, khóa chính, khóa ngoại từ SQL
  /ask       hỏi, trả lời ngay trên chat
  /file      sinh một file .cs/.cshtml/.css/.js; chỉ lưu bản nháp khi gõ SAVE
  /drafts    liệt kê bản nháp     /check  đối chiếu checklist đề thi
  /build     dotnet build trên bản sao tạm (project gốc không bị đổi)
  /help      /exit
'@
}

if (!(Test-Utf8RoundTrip)) { Write-Host 'Cảnh báo: UTF-8 không hoạt động đúng trên máy này; chữ tiếng Việt có thể bị lỗi.' }
if ([Console]::OutputEncoding.CodePage -ne 65001) { Write-Host 'Cảnh báo: cửa sổ không dùng UTF-8. Hãy mở bằng Start-Web-Exam.cmd.' }
Write-Host 'Web Exam 3GB — ASP.NET Core MVC + ADO.NET (offline). Gõ /help để xem lệnh.'
$session = $null
while ($true) {
  try {
    $cmd = (Read-Host 'study').Trim()
    if ($cmd -eq '/exit') { break }
    if ($cmd -eq '/help' -or !$cmd) { Show-Help; continue }
    if ($cmd -eq '/new') { $session = New-Session (Read-Host 'Thư mục project'); Write-Host "Phiên: $($session.id)"; continue }
    if ($cmd -eq '/sessions') { Get-SessionList | ForEach-Object { Write-Host "$($_.id)  $($_.project)  $($_.exam)" }; continue }
    if ($cmd -eq '/open') { $session = Open-Session (Read-Host 'Mã phiên'); Write-Host "Đã mở: $($session.id) — $($session.project)"; continue }
    if ($null -eq $session) { Write-Host 'Dùng /new hoặc /open trước.'; continue }
    if ($cmd -eq '/exam') {
      Write-Host 'Dán chữ đề; kết thúc bằng một dòng chỉ có HET DE.'
      Add-ExamText $session (Read-ExamText { [Console]::ReadLine() })
      Write-Host "Đã lưu đề: $($session.exam.Length) ký tự."; continue
    }
    if ($cmd -eq '/view') {
      $path = [IO.Path]::GetFullPath((Read-Host 'Đường dẫn file .html/.cshtml').Trim().Trim('"'))
      if (!(Test-Path -LiteralPath $path -PathType Leaf) -or [IO.Path]::GetExtension($path).ToLowerInvariant() -notin @('.html','.htm','.cshtml')) { throw 'Chọn một file .html hoặc .cshtml có sẵn.' }
      if ($session.views -notcontains $path) { $session.views = @($session.views) + $path }
      Save-Session $session; Write-Host "Đã đính kèm: $path"; continue
    }
    if ($cmd -eq '/files') { Get-CodeFiles $session.project | ForEach-Object { Write-Host $_.rel }; continue }
    if ($cmd -eq '/schema') { Write-Host (Format-SchemaSummary (Get-ProjectSchema @(Get-CodeFiles $session.project)) 100000); continue }
    if ($cmd -eq '/drafts') { Get-DraftFiles $session | ForEach-Object { Write-Host $_.full }; continue }
    if ($cmd -eq '/check') { Write-Host (Format-Checklist (Test-ExamChecklist $session)); continue }
    if ($cmd -eq '/build') {
      Write-Host 'Đang build bản sao tạm...'
      $result = Invoke-SafeBuild $session
      Write-Host $result.summary
      if ($result.tested) { $session.lastBuild = [pscustomobject]@{ at=(Get-Date -Format 's'); ok=$result.ok }; Save-Session $session }
      continue
    }
    if ($cmd -eq '/ask') {
      $question = Read-Host 'Câu hỏi'
      $timer = [Diagnostics.Stopwatch]::StartNew()
      $answer = Get-ChatAnswer (Get-Prompt $session $question) 1200
      Write-Host ("`nAI ({0:n0}s):`n{1}`n" -f $timer.Elapsed.TotalSeconds, $answer)
      Add-SessionHistory $session $question $answer; continue
    }
    if ($cmd -eq '/file') {
      if (!$session.exam) { throw 'Dán đề bằng /exam trước khi sinh file.' }
      $rel = (Read-Host 'Đường dẫn trong project, ví dụ Controllers/SachController.cs').Trim().Replace('\','/')
      if (!(Test-SafeRelativeFile $rel)) { throw 'Chỉ nhận đường dẫn tương đối an toàn .cs/.cshtml/.css/.js.' }
      $files = @(Get-CodeFiles $session.project)
      $exists = @($files | Where-Object { $_.rel -ieq $rel }).Count -gt 0
      if ($rel -match '(?i)(^|/)Views/Shared/_Layout\.cshtml$' -and !$exists) {
        $pages = @(Get-LayoutPages $session $files)
        $bootstrap = Test-Path -LiteralPath (Join-Path $session.project 'wwwroot\lib\bootstrap\dist\css\bootstrap.min.css')
        if ($pages.Count) {
          $built = New-LayoutFromPages $pages $bootstrap
          $code = $built.layout
          Write-Host "Tách phần chung từ $($pages.Count) trang mẫu thành _Layout.cshtml mới."
          $built.notes | ForEach-Object { Write-Host "Lưu ý: $_" }
        } else {
          $code = New-SimpleLayout $session
          Write-Host 'Không có layout hay trang mẫu: dùng layout Bootstrap/HTML đơn giản.'
        }
      } elseif ($rel -match '(?i)^Models/(\w+)\.cs$' -and !$exists -and ($table = Find-TableForModel (Get-ProjectSchema $files) $Matches[1])) {
        $code = New-ModelCode (Get-ProjectSchema $files) $table (Get-ProjectNamespace $files)
        Write-Host "Sinh Model từ bảng SQL $($table.name) (không dùng AI)."
      } else {
        $request = Read-Host 'File này cần làm gì?'
        $prompt = Get-Prompt $session "Chỉ viết toàn bộ nội dung file $rel, không giải thích, không Markdown. $request" $rel
        $repaired = Repair-GeneratedCode (Remove-CodeFence (Invoke-LocalModel $prompt 2500)) $rel (Get-ProjectNamespace $files)
        $code = $repaired.code
        $repaired.fixes | ForEach-Object { Write-Host "Đã sửa tự động: $_" }
      }
      Write-Host "`nĐỀ XUẤT ${rel}:`n$code`n"
      if ((Read-Host 'Gõ SAVE để lưu bản nháp riêng') -cne 'SAVE') { continue }
      $replace = $false
      if (Test-Path -LiteralPath (Get-DraftPath $session $rel)) {
        if ((Read-Host 'Bản nháp này đã có. Gõ REPLACE để thay') -cne 'REPLACE') { continue }
        $replace = $true
      }
      $target = Save-Draft $session $rel $code -Replace:$replace
      Write-Host "Đã lưu bản nháp: $target (chưa build, chưa chạy với database)"
      continue
    }
    Write-Host 'Lệnh không hợp lệ. Gõ /help.'
  } catch { Write-Host "Lỗi: $($_.Exception.Message)" }
}
