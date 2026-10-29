param([switch]$Live, [int]$LiveRuns = 2)
# Offline checks for the Web Exam kit. -Live also runs the bundled model and records results.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'lib\WebExam.ps1')

$fixtures = Join-Path $PSScriptRoot 'fixtures'
$examples = Join-Path $script:KitRoot 'reference-examples'
$tmp = Join-Path $env:TEMP ('webexam-test-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
$script:SessionDir = Join-Path $tmp 'sessions'
$script:DraftRoot = Join-Path $tmp 'drafts'
$script:passes = 0; $script:failures = [Collections.Generic.List[string]]::new()
function Assert($condition, [string]$name) {
  if ($condition) { $script:passes++ } else { $script:failures.Add($name); Write-Host "  FAIL $name" }
}
function Section([string]$name) { Write-Host "-- $name" }
function Get-TreeHash([string]$folder) {
  return (@(Get-ChildItem -LiteralPath $folder -File -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName).Hash }) -join "`n")
}
function Get-Table($schema, [string]$name) { return @($schema.tables | Where-Object { $_.name -eq $name })[0] }
function New-Queue([string[]]$lines) { $q = [Collections.Generic.Queue[string]]::new(); $lines | ForEach-Object { $q.Enqueue($_) }; return ,$q }

try {
  Section 'specification snapshot'
  Assert ((Get-FileHash -LiteralPath $script:SpecPath -Algorithm SHA256).Hash -eq $script:SpecSha256) 'bundled spec SHA-256 matches approved snapshot'
  $sources = (Get-Content -LiteralPath (Join-Path $script:KitRoot 'lib\WebExam.ps1'), (Join-Path $script:KitRoot 'Study-Exam.ps1') -Raw -Encoding UTF8) -join "`n"
  Assert ($sources -notmatch 'OneDrive') 'kit does not depend on the original OneDrive path'
  Assert ($sources -notmatch '\b(Movie|Category|Tour|Handbag|TuiXach)\b') 'no hardcoded exam entity names'
  Assert ($sources -notmatch 'Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient|HttpClient') 'no network calls in kit logic'

  Section 'SQL schema parsing'
  $catalog = Get-SqlSchema @([IO.File]::ReadAllText((Join-Path $fixtures 'catalog\database.sql')))
  $book = Get-Table $catalog 'Book'
  Assert ($catalog.database -eq 'CatalogDemo') 'catalog database name'
  Assert ($book.primaryKey -contains 'BookId' -and @($book.columns | Where-Object { $_.name -eq 'BookId' })[0].identity) 'catalog Book identity primary key'
  Assert ($book.foreignKeys[0].refTable -eq 'Publisher' -and $book.foreignKeys[0].columns[0] -eq 'PublisherId') 'catalog table-level FK'
  $school = Get-SqlSchema @([IO.File]::ReadAllText((Join-Path $fixtures 'school\database.sql')))
  Assert ((Get-Table $school 'Student').foreignKeys[0].refTable -eq 'Department') 'school FK'
  $de01 = Get-SqlSchema @([IO.File]::ReadAllText((Join-Path $examples 'De01_NhacAlbum_Core\Database\QL_BaiHat.sql')))
  Assert ($de01.database -eq 'QL_BaiHat' -and $de01.tables.Count -eq 5) 'De01 database and five tables'
  Assert ((Get-Table $de01 'tbl_BaiHat').foreignKeys.Count -eq 2) 'De01 inline CONSTRAINT FKs'
  Assert (((Get-Table $de01 'tbl_ChiTietAlbum').primaryKey -join ',') -eq 'MaAB,MaBH') 'De01 composite primary key'
  $de02 = Get-SqlSchema @(Get-ChildItem -LiteralPath (Join-Path $examples 'De02_Shop_Core\Database') -Filter '*.sql' | Sort-Object Name | ForEach-Object { [IO.File]::ReadAllText($_.FullName) })
  $sach = Get-Table $de02 'Sach'
  Assert ($de02.database -eq 'QLSach' -and $de02.tables.Count -eq 8) 'De02 UTF-16 SSMS scripts: database and eight tables'
  Assert (@($sach.foreignKeys | ForEach-Object { $_.refTable }) -contains 'ChuDe' -and @($sach.foreignKeys | ForEach-Object { $_.refTable }) -contains 'NhaXuatBan') 'De02 ALTER TABLE FKs at end of script'
  $de03 = Get-SqlSchema @([IO.File]::ReadAllText((Join-Path $examples 'De03_Tour_Core\Bai_Giai_Hoan_Chinh\De03_Tour_Core\Database\QLTour_Travel.sql')))
  Assert ($de03.database -eq 'QLTour_Travel' -and (Get-Table $de03 'Tour').foreignKeys[0].refTable -eq 'DanhMucTour') 'De03 database and FK'
  Assert (((Get-Table $de03 'LichTrinhTour').primaryKey -join ',') -eq 'MaLichTrinh') 'De03 PRIMARY KEY CLUSTERED with WITH(...) options'
  $fruit = Get-SqlSchema @([IO.File]::ReadAllText((Join-Path $fixtures 'fruit-shop\Database\QLTraiCay.sql')))
  $traiCay = Get-Table $fruit 'TraiCay'; $ncc = Get-Table $fruit 'NhaCungCap'
  Assert ($fruit.database -eq 'QLTraiCay' -and $fruit.warnings.Count -eq 0) 'fruit lowercase script parses without warnings'
  Assert ($ncc.primaryKey[0] -eq 'MaNCC' -and !@($ncc.columns | Where-Object { $_.identity }).Count) 'fruit char primary key is not identity'
  Assert ($traiCay.columns.Count -eq 5 -and @($traiCay.columns | Where-Object { $_.name -eq 'Gia' })[0].type -eq 'decimal(18,2)') 'fruit columns, decimal precision'
  Assert ($traiCay.foreignKeys[0].refTable -eq 'NhaCungCap') 'fruit ALTER TABLE ADD CONSTRAINT FK'
  Assert ((Get-SqlSchema @('SELECT 1')).warnings[0] -match 'CREATE TABLE') 'missing tables produce a warning, not invented columns'
  $summary = Format-SchemaSummary $fruit
  Assert ($summary -match 'IDENTITY: MaTC' -and $summary -match 'MaNCC -> NhaCungCap\.MaNCC') 'schema summary names identity and FK'

  Section 'exam intake'
  $s = New-Session (Join-Path $fixtures 'fruit-shop')
  $q1 = New-Queue @('Câu 1: Tạo layout.', 'HET DE'); Add-ExamText $s (Read-ExamText { if ($q1.Count) { $q1.Dequeue() } })
  $q2 = New-Queue @('Câu 2: Danh sách TraiCay.', '  hết đề  '); Add-ExamText $s (Read-ExamText { if ($q2.Count) { $q2.Dequeue() } })
  Assert ($s.exam -match 'Câu 1' -and $s.exam -match 'Câu 2') 'multi-part exam is appended'
  $threw = $false; try { $q3 = New-Queue @('Câu 3'); Read-ExamText { if ($q3.Count) { $q3.Dequeue() } } | Out-Null } catch { $threw = $true }
  Assert $threw 'input ending before HET DE is rejected'
  $threw = $false; try { Add-ExamText $s ('x' * ($script:MaxExamChars + 1)) } catch { $threw = $true }
  Assert $threw 'oversized exam is rejected'
  Assert ((Get-FocusedExam $s.exam 'Câu 2 làm sao?') -notmatch 'Câu 1') 'question focus selects only the asked part'

  Section 'folder intake'
  $copyA = Join-Path $tmp 'a\Bai1'; $copyB = Join-Path $tmp 'deep\path with space\Bai1'
  foreach ($c in @($copyA, $copyB)) { New-Item -ItemType Directory -Force -Path $c | Out-Null; Copy-Item -Path (Join-Path $fixtures 'fruit-shop\*') -Destination $c -Recurse }
  $relA = @(Get-CodeFiles $copyA | ForEach-Object { $_.rel }) -join '|'; $relB = @(Get-CodeFiles $copyB | ForEach-Object { $_.rel }) -join '|'
  Assert ($relA -eq $relB -and $relA -match 'Database/QLTraiCay\.sql') 'same relative intake from different absolute paths'
  Assert ($relA -notmatch '(^|\|)(bin|obj)/') 'bin/obj are skipped'
  $settings = Get-Excerpt (Join-Path $copyA 'appsettings.json') 5000
  Assert ($settings -notmatch 'SuperSecret123|do-not-leak' -and $settings -match 'Database=QLTraiCay') 'secrets redacted, database name kept'
  Assert ((Get-ProjectInfo @(Get-CodeFiles $copyA)).kind -eq 'core') '.NET 8 project detected'
  Assert ((Get-ProjectInfo @(Get-CodeFiles (Join-Path $fixtures 'mvc5'))).kind -eq 'mvc5') 'MVC5 project detected separately'

  Section 'sessions'
  $other = New-Session $copyB
  for ($i = 1; $i -le 10; $i++) { Add-SessionHistory $s "q$i" "a$i" }
  $reopened = Open-Session $s.id; $otherReopened = Open-Session $other.id
  Assert ($reopened.history.Count -eq $script:MaxHistory -and $reopened.history[-1].user -eq 'q10') 'history bounded and survives restart'
  Assert ($reopened.exam -eq $s.exam) 'exam survives restart'
  Assert ($otherReopened.history.Count -eq 0 -and !$otherReopened.exam) 'sessions stay isolated'
  Assert (@(Get-ChildItem -LiteralPath $script:SessionDir -File).Count -eq 2) 'one file per session, not per turn'
  $legacy = ConvertTo-Session ([pscustomobject]@{ id='20261008-051420-25ebe5'; project='x'; exam=''; view='C:\v.html'; history=@() })
  Assert ($legacy.views[0] -eq 'C:\v.html') 'old single-view sessions migrate'
  $threw = $false; try { Open-Session '..\..\x' | Out-Null } catch { $threw = $true }
  Assert $threw 'session id cannot traverse paths'

  Section 'layout'
  $simple = New-SimpleLayout ([pscustomobject]@{ project=(Join-Path $fixtures 'no-layout') })
  Assert ($simple -match '@RenderBody\(\)' -and $simple -match '@@media' -and $simple -notmatch '(?<!@)@media') 'no-layout fallback is valid Razor'
  $pages = @(Get-LayoutPages ([pscustomobject]@{ views=@() }) @(Get-CodeFiles $copyA))
  $built = New-LayoutFromPages $pages
  Assert ($pages.Count -eq 2) 'sample pages discovered in project'
  Assert ($built.layout -match 'Cửa hàng trái cây' -and $built.layout -match 'shop@@example\.com' -and $built.layout -match '@RenderBody\(\)') 'common header/footer extracted, @ escaped'
  Assert ($built.layout -match 'asp-action="Index"' -and $built.layout -match 'asp-action="ThemMoi"' -and $built.layout -notmatch '\.html"') 'static .html links become MVC actions'
  Assert ($built.layout -match 'href="~/css/style\.css"' -and $built.layout -match '@@media') 'assets rebased, CSS @media escaped'
  Assert ($built.layout -notmatch 'Tìm theo tên|<select') 'page-specific content stays out of layout'
  $one = New-LayoutFromPages @($pages[0])
  Assert ($one.layout -match '<header>' -and $one.layout -match '<footer>') 'single partial page still yields a layout'
  $body = Get-PageBody $pages[0]
  Assert ($body -match 'type="search"' -and $body -notmatch '<header') 'page body keeps content without shared parts'

  Section 'language and encoding'
  Assert ((Get-AnswerLanguageIssue '你好！有什么我可以帮忙的吗？') -eq 'drift') 'Chinese answer flagged as drift'
  Assert ((Get-AnswerLanguageIssue 'Xin chào! Bạn cần giúp gì?') -eq '') 'Vietnamese answer accepted'
  Assert ((Get-AnswerLanguageIssue 'Xin chÃ o báº¡n') -eq 'encoding') 'mojibake flagged as encoding, not drift'
  Assert ((Get-AnswerLanguageIssue "Đây là code:`n``````n// 注释`n``````") -eq '') 'code blocks are not language-checked'
  Assert (Test-Utf8RoundTrip) 'UTF-8 round trip'
  $script:calls = 0
  $answer = Get-ChatAnswer 'p' 10 { param($p, $t) $script:calls++; if ($script:calls -eq 1) { '你好' } else { 'Xin chào' } }
  Assert ($answer -eq 'Xin chào' -and $script:calls -eq 2) 'drift triggers one Vietnamese retry'
  $answer = Get-ChatAnswer 'p' 10 { param($p, $t) '你好' }
  Assert ($answer -match '^\[Cảnh báo') 'persistent drift is reported, not hidden'

  Section 'models'
  $files = @(Get-CodeFiles $copyA)
  $traiCayCode = New-ModelCode $fruit (Find-TableForModel $fruit 'TraiCay') (Get-ProjectNamespace $files)
  Assert ($traiCayCode -match 'namespace FruitShop\.Models;' -and $traiCayCode -match 'public decimal Gia' -and $traiCayCode -match 'public DateTime\? NgayNhap') 'model types map from SQL'
  Assert ($traiCayCode -match 'public string MaNCC \{ get; set; \} = "";' -and $traiCayCode -match 'TenNhaCungCap') 'FK column and JOIN name property'
  Assert ((New-ModelCode $fruit $ncc 'X') -match 'public string\? DienThoai') 'nullable string column'
  Assert ((Find-TableForModel $de01 'BaiHat').name -eq 'tbl_BaiHat') 'tbl_ prefix maps to clean model name'
  $fixed = Repair-GeneratedCode "using De02_Shop_Core.Models;`nusing Microsoft.EntityFrameworkCore;`nnamespace De02_Shop_Core.Controllers;`nclass A { object x = new SelectList(null); }" 'Controllers/TraiCayController.cs' 'FruitShop'
  Assert ($fixed.code -match 'using FruitShop\.Models;' -and $fixed.code -match 'namespace FruitShop\.Controllers;' -and $fixed.code -match 'using Microsoft\.AspNetCore\.Mvc\.Rendering;') 'copied namespace/usings repaired'
  Assert ($fixed.code -match 'EntityFrameworkCore' -and $fixed.fixes.Count -eq 3) 'EF is left for /check to report, fixes are listed'
  Assert ((Get-Reference 'Controllers/XController.cs' 'FruitShop') -notmatch 'De02_Shop_Core') 'reference sample uses target namespace'

  Section 'drafts never touch the project'
  $before = Get-TreeHash $copyA
  $ds = New-Session $copyA
  Assert ((Test-SafeRelativeFile 'Views/Home/Index.cshtml') -and !(Test-SafeRelativeFile '../evil.cs') -and !(Test-SafeRelativeFile 'C:/evil.cs') -and !(Test-SafeRelativeFile 'Views/./x.cs') -and !(Test-SafeRelativeFile 'appsettings.json')) 'relative path rules'
  $draft = Save-Draft $ds 'Models/TraiCay.cs' $traiCayCode
  Assert ($draft.StartsWith($script:DraftRoot) -and (Test-Path -LiteralPath $draft)) 'draft saved under drafts/<session>'
  $threw = $false; try { Save-Draft $ds 'Models/TraiCay.cs' 'x' | Out-Null } catch { $threw = $true }
  Assert $threw 'existing draft is not overwritten without REPLACE'

  Section 'checklist and build'
  Save-Draft $ds 'Models/NhaCungCap.cs' (New-ModelCode $fruit $ncc 'FruitShop') | Out-Null
  Save-Draft $ds 'Views/Shared/_Layout.cshtml' $built.layout | Out-Null
  Save-Draft $ds 'Controllers/TraiCayController.cs' ([IO.File]::ReadAllText((Join-Path $fixtures 'good\TraiCayController.cs'))) | Out-Null
  foreach ($v in @('Index','Create','Edit')) { Save-Draft $ds "Views/TraiCay/$v.cshtml" ([IO.File]::ReadAllText((Join-Path $fixtures "good\$v.cshtml"))) | Out-Null }
  $ds.exam = 'Câu 1: Hiển thị danh sách TraiCay kèm tên NhaCungCap, tìm kiếm. Câu 2: Thêm, sửa, xóa TraiCay.'
  $good = @(Test-ExamChecklist $ds)
  $goodFailed = @($good | Where-Object { $_.status -eq 'failed' })
  if ($goodFailed.Count) { Write-Host (Format-Checklist $goodFailed) }
  Assert ($goodFailed.Count -eq 0) 'correct ADO.NET solution passes every static check'
  Assert (@($good | Where-Object { $_.item -match 'dữ liệu thật' })[0].status -eq 'not tested') 'runtime/database check stays "not tested"'
  $plan = Get-BuildPlan $ds
  if ($plan.canBuild) {
    $build = Invoke-SafeBuild $ds
    if (!$build.ok) { Write-Host $build.summary }
    Assert $build.ok 'generated layout + models + good controller/views compile (dotnet build on a temp copy)'
  } else { Write-Host "  skip build: $($plan.reason)" }
  Assert (!(Get-BuildPlan ([pscustomobject]@{ id='x'; project=(Join-Path $fixtures 'mvc5') })).canBuild) 'MVC5 build is declined'
  Assert ((Get-TreeHash $copyA) -eq $before) 'project folder unchanged by drafts, checklist and build'

  $bad = New-Session $copyB
  Save-Draft $bad 'Controllers/TraiCayController.cs' ([IO.File]::ReadAllText((Join-Path $fixtures 'bad\TraiCayController.cs'))) | Out-Null
  $badResult = @{}; Test-ExamChecklist $bad | ForEach-Object { $badResult[$_.item] = $_.status }
  Assert ($badResult['Không dùng Entity Framework'] -eq 'failed') 'EF usage is flagged'
  Assert ($badResult['Không INSERT khóa chính IDENTITY'] -eq 'failed') 'IDENTITY insert is flagged'
  Assert ($badResult['SQL dùng tham số, không nối chuỗi'] -eq 'failed') 'string-concatenated SQL is flagged'
  Assert ($badResult['Sau khi lưu/xóa có RedirectToAction("Index")'] -eq 'failed') 'missing redirect is flagged'
  Assert ($badResult['Xóa dùng [HttpPost]'] -eq 'failed') 'GET delete is flagged'

  if ($Live) {
    Section 'live model (bundled Qwen2.5-Coder-3B)'
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $report = [Collections.Generic.List[string]]::new()
    $report.Add("# Web Exam 3GB live run $(Get-Date -Format 's')"); $report.Add('')
    $greet = New-Session (Join-Path $fixtures 'no-layout')
    for ($i = 1; $i -le 3; $i++) {
      $timer = [Diagnostics.Stopwatch]::StartNew()
      $hello = Get-ChatAnswer (Get-Prompt $greet 'chao') 120
      $issue = Get-AnswerLanguageIssue $hello
      $report.Add("- Greeting run ${i}: $([int]$timer.Elapsed.TotalSeconds)s, issue='$issue': $($hello -replace '\s+',' ')")
      Assert ($issue -eq '' -and $hello -notmatch '^\[Cảnh báo') "live greeting $i answered in Vietnamese"
    }
    $cases = @(
      @{ fixture='fruit-shop'; ns='FruitShop'; main='TraiCay'; ref='NhaCungCap' },
      @{ fixture='catalog'; ns='Catalog'; main='Book'; ref='Publisher' }
    )
    for ($run = 1; $run -le $LiveRuns; $run++) {
      foreach ($case in $cases) {
        $project = Join-Path $tmp "live-$run-$($case.fixture)"
        New-Item -ItemType Directory -Force -Path $project | Out-Null
        Copy-Item -Path (Join-Path $fixtures "$($case.fixture)\*") -Destination $project -Recurse
        $hash = Get-TreeHash $project
        $ls = New-Session $project
        Add-ExamText $ls "Câu 1: Tạo layout chung. Câu 2: Hiển thị danh sách $($case.main) kèm tên $($case.ref) (JOIN), có tìm kiếm theo tên bằng GET. Câu 3: Thêm, sửa, xóa $($case.main); khi thêm/sửa chọn $($case.ref) bằng dropdown."
        $files = @(Get-CodeFiles $project); $schema = Get-ProjectSchema $files
        $pagesLive = @(Get-LayoutPages $ls $files)
        $layout = if ($pagesLive.Count) { (New-LayoutFromPages $pagesLive).layout } else { New-SimpleLayout $ls }
        Save-Draft $ls 'Views/Shared/_Layout.cshtml' $layout | Out-Null
        foreach ($t in $schema.tables) { Save-Draft $ls "Models/$(Get-ModelClassName $t.name).cs" (New-ModelCode $schema $t $case.ns) | Out-Null }
        $timings = @()
        foreach ($target in @(
          @{ rel="Controllers/$($case.main)Controller.cs"; ask="Controller ADO.NET cho bảng $($case.main), namespace $($case.ns).Controllers: Index(string? keyword) SELECT JOIN $($case.ref) và tìm kiếm LIKE; Create GET/POST với ViewBag SelectList cho $($case.ref); Edit GET/POST; Delete POST. Sau khi lưu/xóa RedirectToAction(""Index"")."; tokens=2500 },
          @{ rel="Views/$($case.main)/Index.cshtml"; ask="View danh sách @model List<$($case.main)>, form GET tìm kiếm name=""keyword"", bảng hiển thị cả tên $($case.ref), link Create/Edit và form POST Delete."; tokens=1500 },
          @{ rel="Views/$($case.main)/Create.cshtml"; ask="Form thêm @model $($case.main), method post, input asp-for đúng thuộc tính Model (bỏ cột IDENTITY), dropdown <select asp-for> cho khóa ngoại lấy từ ViewBag."; tokens=1200 }
        )) {
          $timer = [Diagnostics.Stopwatch]::StartNew()
          $code = Remove-CodeFence (Invoke-LocalModel (Get-Prompt $ls "Chỉ viết toàn bộ nội dung file $($target.rel), không giải thích, không Markdown. $($target.ask)" $target.rel) $target.tokens)
          $repaired = Repair-GeneratedCode $code $target.rel $case.ns
          $timings += "$($target.rel) $([int]$timer.Elapsed.TotalSeconds)s$(if ($repaired.fixes.Count) { ' (sửa: ' + ($repaired.fixes -join '; ') + ')' })"
          Save-Draft $ls $target.rel $repaired.code | Out-Null
        }
        $keep = Join-Path $PSScriptRoot "results\drafts-$stamp\run$run-$($case.fixture)"
        New-Item -ItemType Directory -Force -Path $keep | Out-Null
        Copy-Item -Path (Join-Path $script:DraftRoot "$($ls.id)\*") -Destination $keep -Recurse
        $build = Invoke-SafeBuild $ls
        $ls.lastBuild = [pscustomobject]@{ at=(Get-Date -Format 's'); ok=$build.ok }
        $check = @(Test-ExamChecklist $ls)
        $report.Add(''); $report.Add("## Run $run — $($case.fixture) ($($case.main) -> $($case.ref))")
        $report.Add("- Model time: $($timings -join ', ')")
        $report.Add("- dotnet build: $(if ($build.ok) { 'OK' } else { 'FAILED' })")
        if (!$build.ok) { $report.Add('```'); $report.Add($build.summary); $report.Add('```') }
        $report.Add('```'); $report.Add((Format-Checklist $check)); $report.Add('```')
        Assert ((Get-TreeHash $project) -eq $hash) "live run $run $($case.fixture): project unchanged"
        Write-Host "  run $run $($case.fixture): build=$($build.ok) failed-checks=$(@($check | Where-Object { $_.status -eq 'failed' }).Count)"
      }
    }
    $resultDir = Join-Path $PSScriptRoot 'results'
    New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
    $reportPath = Join-Path $resultDir "live-$stamp.md"
    [IO.File]::WriteAllText($reportPath, ($report -join "`n"), $script:Utf8)
    Write-Host "Live report: $reportPath"
  }
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Passed: $($script:passes), failed: $($script:failures.Count)"
if ($script:failures.Count) { $script:failures | ForEach-Object { Write-Host "FAILED: $_" }; exit 1 }
Write-Host 'Self-test passed.'
