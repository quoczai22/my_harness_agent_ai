param([switch]$Live, [int]$LiveRuns = 2)
# Offline checks for the Flutter exam kit. -Live also uses LM Studio and records results.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'lib\FlutterExam.ps1')
Import-LmConfig (Join-Path $script:KitRoot 'config.json')

$fixtures = Join-Path $PSScriptRoot 'fixtures'
$pdfDir = Join-Path $fixtures 'pdf'
$tmp = Join-Path $env:TEMP ('flutter-exam-test-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$script:SessionDir = Join-Path $tmp 'sessions'
$script:DraftRoot = Join-Path $tmp 'drafts'
$script:passes = 0; $script:failures = [Collections.Generic.List[string]]::new()
function Assert($condition, [string]$name) {
  if ($condition) { $script:passes++ } else { $script:failures.Add($name); Write-Host "  FAIL $name" }
}
function Section([string]$name) { Write-Host "-- $name" }
function Get-TreeHash([string]$folder) {
  return (@(Get-ChildItem -LiteralPath $folder -File -Recurse -Force | Sort-Object FullName | ForEach-Object { $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName).Hash }) -join "`n")
}
function Copy-Fixture([string]$name, [string]$dest) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $fixtures "$name\*") -Destination $dest -Recurse -Force
  return $dest
}
function New-Queue([string[]]$lines) { $q = [Collections.Generic.Queue[string]]::new(); $lines | ForEach-Object { $q.Enqueue($_) }; return ,$q }
function Get-Similarity([string]$a, [string]$b) {
  # Word-level recall of the source text in the transcription (case-insensitive, punctuation ignored).
  $norm = { param($t) @(($t.ToLowerInvariant() -replace '[^\p{L}\p{N}@]+',' ').Split(' ', [StringSplitOptions]::RemoveEmptyEntries)) }
  $src = & $norm $a; $got = & $norm $b
  $bag = @{}; foreach ($w in $got) { $bag[$w] = 1 + [int]$bag[$w] }
  $hit = 0; foreach ($w in $src) { if ([int]$bag[$w] -gt 0) { $hit++; $bag[$w]-- } }
  if (!$src.Count) { return 0 }
  return [Math]::Round($hit / $src.Count, 3)
}
function Start-StubServer([string]$responseBody) {
  # Minimal HTTP server on a loopback TcpListener (HttpListener would need a URL ACL).
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $ps = [PowerShell]::Create()
  $null = $ps.AddScript({
    param($listener, $body)
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
    $length = 0
    while (($line = $reader.ReadLine())) { if ($line -match '^Content-Length:\s*(\d+)') { $length = [int]$Matches[1] } }
    # Content-Length counts bytes; Vietnamese characters take several, so count bytes of what was read.
    $sb = [Text.StringBuilder]::new(); $chunk = New-Object char[] 1024; $got = 0
    while ($got -lt $length) { $n = $reader.Read($chunk, 0, $chunk.Length); if ($n -le 0) { break }; $null = $sb.Append($chunk, 0, $n); $got += [Text.Encoding]::UTF8.GetByteCount($chunk, 0, $n) }
    $buffer = $sb.ToString()
    $bytes = [Text.Encoding]::UTF8.GetBytes($body)
    $head = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: application/json`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n")
    $stream.Write($head, 0, $head.Length); $stream.Write($bytes, 0, $bytes.Length); $stream.Flush()
    $client.Close()
    return $buffer
  }).AddArgument($listener).AddArgument($responseBody)
  return [pscustomobject]@{ listener=$listener; ps=$ps; handle=$ps.BeginInvoke(); port=$listener.LocalEndpoint.Port }
}

try {
  Section 'LM Studio client guards'
  foreach ($ok in @('http://127.0.0.1:1234', 'http://localhost:1234/v1', 'http://[::1]:1234/')) { Assert (Test-LoopbackUrl $ok) "loopback accepted: $ok" }
  foreach ($bad in @('http://192.168.1.5:1234', 'https://api.openai.com/v1', 'http://127.0.0.1.evil.com:1234', 'http://user@127.0.0.1:1234', 'http://127.0.0.1:1234/x', 'https://127.0.0.1:1234', 'http://127.0.0.1:1234/?u=x')) { Assert (!(Test-LoopbackUrl $bad)) "non-loopback rejected: $bad" }
  $saved = $script:LmConfig.baseUrl
  $script:LmConfig.baseUrl = 'http://10.0.0.1:1234'
  $threw = $false; try { Invoke-LmHttp 'GET' '/v1/models' } catch { $threw = $_.Exception.Message -match 'Chỉ cho phép' }
  Assert $threw 'request to non-loopback config is refused before sending'
  $script:LmConfig.baseUrl = 'http://127.0.0.1:9'
  $threw = $false; try { Invoke-LmHttp 'GET' '/v1/models' $null 3 } catch { $threw = $_.Exception.Message -match 'Không kết nối' }
  Assert $threw 'server down maps to a Vietnamese message'
  Assert ((ConvertTo-LmError 400 '{"error":"context length exceeded"}') -match 'quá dài') 'context error mapped'
  Assert ((ConvertTo-LmError 404 '{"error":"No models loaded"}') -match 'lms load') 'model-not-loaded error mapped'
  $stub = Start-StubServer '{"choices":[{"message":{"content":"<think>x</think>Xin chào, đây là màn hình đăng nhập"},"finish_reason":"stop"}]}'
  $script:LmConfig.baseUrl = "http://127.0.0.1:$($stub.port)"
  $answer = Invoke-LmChat 'sys' 'chào' 50
  $sent = $stub.ps.EndInvoke($stub.handle)[0]
  $stub.listener.Stop(); $stub.ps.Dispose()
  Assert ($answer -ceq 'Xin chào, đây là màn hình đăng nhập') 'charset-less UTF-8 response decoded, <think> stripped'
  Assert ($sent -match '"reasoning_effort":"none"' -and $sent -match '"model":"qwen3.5-2b"') 'request disables reasoning and names the model'
  $script:LmConfig.baseUrl = $saved

  Section 'PDF intake'
  $p1 = Get-PdfPages (Join-Path $pdfDir 'exam-01.pdf')
  Assert ($p1.pages.Count -eq 1 -and $p1.pages[0].hasText -and $p1.pages[0].text -match 'ProductDetailScreen') 'text PDF page extracted with Vietnamese'
  $scan = Import-ExamPdf (Join-Path $pdfDir 'exam-02-scan.pdf')
  Assert ($scan.unsupportedPages -contains 1 -and $scan.text -match 'không có chữ') 'scanned page reported, not invented'
  $script:seenImage = ''
  $ocr = Import-ExamPdf (Join-Path $pdfDir 'mixed.pdf') { param($img) $script:seenImage = $img; 'Câu 1: LoginScreen' }
  Assert ($ocr.pages -eq 2 -and $ocr.ocrPages -contains 2 -and $ocr.text -match 'ProductListScreen' -and $ocr.text -match 'cần kiểm tra') 'mixed PDF: text page kept, scan page transcribed and flagged'
  Assert ($script:seenImage -and !(Test-Path -LiteralPath $script:seenImage)) 'rendered page image deleted after use'
  Assert ($ocr.sha256.Length -eq 64) 'PDF hash recorded'
  Assert ((Test-TranscriptionLooksSolved "Dưới đây là mã nguồn:`nclass A {}") -and (Test-TranscriptionLooksSolved "x`n``````dart`nclass A {}`n``````") -and !(Test-TranscriptionLooksSolved "Câu 1: Tạo LoginScreen`n{""title"": ""a""}")) 'solved-instead-of-copied output detected'
  $script:tries = @()
  $copied = Invoke-PageTranscription 'img.png' { param($img, $strict) $script:tries += $strict; if (!$strict) { 'Dưới đây là lời giải: class A {}' } else { 'Câu 1: LoginScreen' } }
  Assert ($copied -eq 'Câu 1: LoginScreen' -and ($script:tries -join ',') -eq 'False,True') 'solved transcription retried once in strict mode'
  $solvedPdf = Import-ExamPdf (Join-Path $pdfDir 'exam-02-scan.pdf') { param($img) Invoke-PageTranscription $img { param($i, $strict) '```dart class A {} ```' } }
  Assert ($solvedPdf.unsupportedPages -contains 1 -and $solvedPdf.ocrPages.Count -eq 0 -and $solvedPdf.text -notmatch 'class A') 'model code is never stored as exam text'
  $notPdf = Join-Path $tmp 'note.txt'; Set-Content -LiteralPath $notPdf -Value 'x'
  $broken = Join-Path $tmp 'broken.pdf'; Set-Content -LiteralPath $broken -Value 'not a pdf'
  $huge = Join-Path $tmp 'huge.pdf'; $fs = [IO.File]::Create($huge); $fs.SetLength(11MB); $fs.Dispose()
  foreach ($case in @(@($notPdf, '.pdf'), @($broken, 'hỏng'), @($huge, '10 MB'), @((Join-Path $tmp 'missing.pdf'), 'Không tìm thấy'))) {
    $msg = ''; try { Get-PdfPages $case[0] | Out-Null } catch { $msg = $_.Exception.Message }
    Assert ($msg -match [regex]::Escape($case[1])) "bad PDF input rejected: $([IO.Path]::GetFileName($case[0]))"
  }
  Assert ((Format-ExamText "applica-`ntion ứng-`ndụng a -`n b") -eq "application ứng-`ndụng a -`n b") 'only English hyphenation is rejoined'
  Assert ((Format-ExamText "    a     b`n`n`n`nc") -eq "a b`n`nc") 'layout spacing collapsed'
  Assert ((Format-ExamText "x`n    a     b") -eq "x`n    a b") 'indentation kept for code'

  Section 'exam text and sessions'
  $s = New-Session (Copy-Fixture 'good-app' (Join-Path $tmp 'a\product_app'))
  $q = New-Queue @('Câu 1: A', 'HET DE'); Set-ExamText $s (Read-ExamText { if ($q.Count) { $q.Dequeue() } })
  $q = New-Queue @('Câu 2: B', 'hết đề'); Set-ExamText $s (Read-ExamText { if ($q.Count) { $q.Dequeue() } }) -Append
  Assert ($s.exam -match 'Câu 1' -and $s.exam -match 'Câu 2') 'multi-part exam appended'
  $threw = $false; try { $q = New-Queue @('x'); Read-ExamText { if ($q.Count) { $q.Dequeue() } } | Out-Null } catch { $threw = $true }
  Assert $threw 'input ending before HET DE is rejected'
  $exam01 = [IO.File]::ReadAllText((Join-Path $pdfDir 'exam-01.txt'))
  $focused = Get-FocusedExam $exam01 'Câu 3 làm thế nào?'
  Assert ($focused -match 'AddProductScreen' -and $focused -notmatch 'ProductListScreen hiển thị') 'question focus selects the asked part'
  $other = New-Session (Copy-Fixture 'empty-app' (Join-Path $tmp 'b\note_app'))
  for ($i = 1; $i -le 10; $i++) { Add-SessionHistory $s "q$i" "a$i" }
  $s.screens = @('ProductListScreen','ProductDetailScreen','AddProductScreen'); Save-Session $s
  $re = Open-Session $s.id; $reOther = Open-Session $other.id
  Assert ($re.history.Count -eq 8 -and $re.history[-1].user -eq 'q10' -and @($re.screens).Count -eq 3) 'bounded history and screens survive restart'
  Assert (!$reOther.exam -and $reOther.history.Count -eq 0) 'sessions isolated'
  $threw = $false; try { Open-Session '..\x' | Out-Null } catch { $threw = $true }
  Assert $threw 'session id cannot traverse paths'

  Section 'Flutter project intake'
  $relA = @(Get-ProjectFiles $s.project | ForEach-Object { $_.rel }) -join '|'
  $relB = @(Get-ProjectFiles (Copy-Fixture 'good-app' (Join-Path $tmp 'deep\with space\x')) | ForEach-Object { $_.rel }) -join '|'
  Assert ($relA -eq $relB) 'same intake from different absolute paths'
  Assert ($relA -match 'lib/main\.dart' -and $relA -match 'test/widget_test\.dart' -and $relA -match 'assets/images/logo\.png') 'sources, tests and assets found'
  Assert ($relA -notmatch 'build/|\.dart_tool|android/') 'build, .dart_tool and platform folders skipped'
  $config = Read-SourceText (Join-Path $s.project 'lib\config.dart')
  Assert ($config -notmatch 'SECRET' -and $config -match 'Cửa hàng') 'secrets redacted, other text kept'
  $pub = Read-Pubspec ([IO.File]::ReadAllText((Join-Path $s.project 'pubspec.yaml')))
  Assert ($pub.name -eq 'product_app' -and $pub.usesFlutter -and $pub.dependencies -contains 'cupertino_icons' -and $pub.devDependencies -contains 'flutter_lints') 'pubspec parsed'
  Assert ($pub.assets[0] -eq 'assets/images/' -and $pub.sdk -eq '>=3.0.0 <4.0.0' -and (Test-NullSafeSdk $pub.sdk)) 'assets and SDK parsed'
  Assert (!(Test-NullSafeSdk '>=2.7.0 <3.0.0') -and (Test-NullSafeSdk '^3.4.0') -and $null -eq (Test-NullSafeSdk 'any')) 'null-safety detection'
  $project = Get-ProjectModel $s
  $summary = Get-ProjectSummary $project
  Assert ($summary -match 'package:product_app/' -and $summary -match 'ProductListScreen extends StatefulWidget' -and $summary -match '/detail') 'project summary'

  Section 'deterministic generators'
  $samples = @(Find-JsonSamples $exam01)
  Assert ($samples.Count -eq 1) 'one JSON sample found in exam 01'
  $product = New-DartModelCode 'Product' $samples[0].value
  foreach ($expect in @('final int id;', 'final String name;', 'final double price;', 'final bool inStock;', 'final List<String> tags;', 'final Category? category;', 'class Category', 'final String title;',
      "price: (json['price'] as num).toDouble(),", "json['category'] == null ? null : Category.fromJson(json['category'] as Map<String, dynamic>)",
      "tags: (json['tags'] as List<dynamic>).map((e) => e as String).toList(),", "'category': category?.toJson(),", 'required this.id', 'this.category')) {
    Assert ($product.Contains($expect)) "Product model contains: $expect"
  }
  Assert ($product -notmatch 'required this\.category') 'nullable field is not required'
  $nested = New-DartModelCode 'Order' ('{"class":"A","default":1,"items":[{"a":1},{"a":2.5,"b":"x"}]}' | ConvertFrom-Json)
  Assert ($nested.Contains('final String classValue;') -and $nested.Contains("classValue: json['class'] as String,") -and $nested.Contains('final int defaultValue;')) 'Dart keywords renamed, JSON keys kept'
  Assert ($nested.Contains('final List<Item> items;') -and $nested.Contains('class Item') -and $nested.Contains('final double a;') -and $nested.Contains('final String? b;')) 'list of objects merged across samples'
  $note = New-DartModelCode 'Note' ((Find-JsonSamples ([IO.File]::ReadAllText((Join-Path $pdfDir 'exam-02.txt'))))[0].value)
  Assert ($note.Contains('final bool done;') -and $note.Contains('final int priority;')) 'Note model from exam 02 sample'
  $main = New-MainDartCode $project @('ProductListScreen','ProductDetailScreen','Ghost') 'product_app'
  Assert ($main.Contains("import 'package:product_app/screens/product_list_screen.dart';") -and $main.Contains("'/': (context) => const ProductListScreen(),") -and $main.Contains("'/product_detail': (context) => const ProductDetailScreen(),")) 'main.dart routes for existing screens'
  Assert ($main.Contains('Chưa có lớp cho: Ghost') -and $main -notmatch 'const Ghost') 'missing screens are reported, not referenced'
  $mainNoFirst = New-MainDartCode $project @('Ghost','ProductDetailScreen') 'product_app'
  Assert ($mainNoFirst.Contains("initialRoute: '/product_detail'")) 'initial route falls back to the first existing screen'
  $s.exam = $exam01
  $rules = (Get-ExamRules $s $project) -join "`n"
  Assert ($rules.Contains("'/product_detail' -> ProductDetailScreen") -and $rules.Contains("'/' -> ProductListScreen")) 'prompt rules carry the same routes as main.dart'
  Assert ($rules -match 'TextFormField có validator' -and $rules -match 'Product' -and $rules -match 'package:product_app/') 'prompt rules carry validator, model and package requirements'
  Assert ((Get-Prompt $s 'Câu 3' 'lib/screens/add_product_screen.dart') -match 'QUY TẮC BẮT BUỘC') 'rules included in the prompt'
  Assert ((Test-ExamNeedsValidation 'mật khẩu tối thiểu 6 ký tự') -and !(Test-ExamNeedsValidation 'hiển thị danh sách')) 'validation requirement detection'
  $repaired = Repair-DartCode "import 'package:my_app/models/product.dart';`nimport 'package:http/http.dart';`nclass A extends StatelessWidget { Widget build(BuildContext c) => Scaffold(); }" 'lib/a.dart' $project
  Assert ($repaired.code.Contains("import 'package:product_app/models/product.dart'") -and $repaired.code.StartsWith("import 'package:flutter/material.dart';") -and $repaired.code.Contains('package:http/http.dart') -and $repaired.fixes.Count -eq 2) 'wrong own-package import and missing material import repaired; unknown package left for /check'

  Section 'drafts'
  $before = Get-TreeHash $s.project
  Assert ((Test-SafeDraftPath 'lib/screens/a.dart') -and (Test-SafeDraftPath 'assets/data.json') -and !(Test-SafeDraftPath '../a.dart') -and !(Test-SafeDraftPath 'lib/../../x.dart') -and !(Test-SafeDraftPath 'pubspec.yaml') -and !(Test-SafeDraftPath 'C:/x.dart') -and !(Test-SafeDraftPath 'android/a.dart')) 'draft path rules'
  $d = Save-Draft $s 'lib/models/catalog.dart' $product
  Assert ($d.StartsWith($script:DraftRoot) -and (Test-Path $d)) 'draft saved under drafts/<session>'
  $threw = $false; try { Save-Draft $s 'lib/models/catalog.dart' 'x' | Out-Null } catch { $threw = $true }
  Assert $threw 'existing draft not overwritten without REPLACE'
  Assert (@(Get-WorkingFiles $s | Where-Object { $_.rel -eq 'lib/models/catalog.dart' }).Count -eq 1) 'drafts visible in working tree'

  Section 'checklist'
  Remove-Item -LiteralPath (Join-Path $script:DraftRoot $s.id) -Recurse -Force
  Set-ExamText $s $exam01
  $good = @(Test-FlutterChecklist $s)
  $goodFailed = @($good | Where-Object { $_.status -eq 'failed' })
  if ($goodFailed.Count) { Write-Host (Format-Checklist $goodFailed) }
  Assert ($goodFailed.Count -eq 0) 'correct project passes every static check'
  Assert (@($good | Where-Object { $_.status -eq 'verified' }).Count -ge 11) 'checks were actually evaluated'
  Assert (@($good | Where-Object { $_.item -match 'Chạy ứng dụng' })[0].status -eq 'not tested') 'running the app stays not tested'
  $b = New-Session (Copy-Fixture 'broken-app' (Join-Path $tmp 'c\broken'))
  Set-ExamText $b $exam01; $b.screens = @('CartScreen','HomeScreen','ProductListScreen'); Save-Session $b
  $badResult = @{}; Test-FlutterChecklist $b | ForEach-Object { $badResult[$_.item] = $_ }
  foreach ($item in @('SDK có null safety (>= 2.12)', 'Package import đã khai báo trong pubspec', 'Mọi import trỏ tới file có thật', 'lib/main.dart có main() gọi runApp',
      'Đủ các màn hình đề yêu cầu', 'Route đặt tên đều được khai báo', 'StatefulWidget có State và setState đúng chỗ', 'Form có validator (đề yêu cầu kiểm tra dữ liệu)',
      'Model có fromJson/toJson (đề dùng JSON/API)', 'Asset dùng trong code đã khai báo và tồn tại')) {
    Assert ($badResult[$item].status -eq 'failed') "broken project flagged: $item"
  }
  Assert ($badResult['Package import đã khai báo trong pubspec'].detail -match 'package:http/' -and $badResult['Đủ các màn hình đề yêu cầu'].detail -match 'ProductListScreen') 'failure details name the culprit'
  Assert ($badResult['StatefulWidget có State và setState đúng chỗ'].detail -match 'CartScreen' -and $badResult['StatefulWidget có State và setState đúng chỗ'].detail -match 'HomeScreen') 'State and setState details'

  $cut = @(Get-ClassBodies "class A extends StatefulWidget {`n  State<A> createState() => _AState();`n}`nclass _AState extends State<A> {`n  Widget build(")
  Assert ($cut.Count -eq 2 -and $cut[1].base -eq 'State<A>') 'truncated model output does not crash class parsing'
  Save-Draft $b 'lib/cut.dart' "import 'login screen:<x>.dart';`nimport 'notes';`nimport '../../../../outside.dart';`nclass Cut extends StatelessWidget {`n  Widget build(" | Out-Null
  $cutImports = (@(Test-FlutterChecklist $b | Where-Object { $_.item -eq 'Mọi import trỏ tới file có thật' }))[0]
  Assert ($cutImports.status -eq 'failed' -and $cutImports.detail -match 'login screen') 'malformed import URIs reported as unresolved'
  $threw = $false; try { Test-FlutterChecklist $b | Out-Null } catch { $threw = $true }
  Assert (!$threw) '/check survives a truncated draft'

  Section 'analyze'
  $savedPath = $env:PATH
  $env:PATH = ($env:PATH -split ';' | Where-Object { $_ -and !(Test-Path (Join-Path $_ 'flutter.bat')) -and !(Test-Path (Join-Path $_ 'flutter.cmd')) -and !(Test-Path (Join-Path $_ 'flutter.exe')) }) -join ';'
  Assert (!(Get-AnalyzePlan $s).canRun -and (Get-AnalyzePlan $s).reason -match 'PATH') 'no Flutter SDK -> analysis not tested'
  Assert ((Get-AnalyzePlan $other).reason -match 'pub get') 'never-fetched project is not analyzed (no downloads)'
  $stubDir = Join-Path $tmp 'stub-sdk'; New-Item -ItemType Directory -Force -Path $stubDir | Out-Null
  Save-Draft $s 'lib/drafted.dart' '// draft' | Out-Null
  $stubFlutter = Join-Path $stubDir 'flutter.cmd'
  [IO.File]::WriteAllText($stubFlutter, "@echo off`r`nif exist lib\drafted.dart echo DRAFT-PRESENT`r`necho   error - Undefined name 'x' - lib/main.dart:3:5 - undefined_identifier`r`nexit /b 1`r`n")
  $env:PATH = "$stubDir;$env:PATH"
  $before = Get-TreeHash $s.project
  $analysis = Invoke-SafeAnalyze $s
  Assert ($analysis.tested -and !$analysis.ok -and $analysis.summary -match 'Undefined name') 'analysis errors reported from the SDK output'
  [IO.File]::WriteAllText($stubFlutter, "@echo off`r`nif exist lib\drafted.dart (echo DRAFT-PRESENT) else (exit /b 3)`r`nexit /b 0`r`n")
  $analysis = Invoke-SafeAnalyze $s
  Assert ($analysis.ok) 'analysis runs on a copy that includes drafts'
  Assert ((Get-TreeHash $s.project) -eq $before) 'project unchanged by drafts and analysis'
  Assert (!@(Get-ChildItem $env:TEMP -Directory -Filter 'flutter-exam-analyze-*' -ErrorAction SilentlyContinue).Count) 'temporary analysis copies removed'
  $env:PATH = $savedPath

  Section 'language'
  $cjk = -join @([char]0x4F60, [char]0x597D)
  Assert ((Get-AnswerLanguageIssue $cjk) -eq 'drift') 'CJK answer flagged as drift'
  Assert ((Get-AnswerLanguageIssue 'Xin chào bạn') -eq '') 'Vietnamese accepted'
  Assert ((Get-AnswerLanguageIssue ('Xin ch' + [char]0xC3 + [char]0xA0 + 'o b' + [char]0xE1 + [char]0xBA + [char]0xA1 + 'n')) -eq 'encoding') 'mojibake flagged as encoding'
  Assert ((Get-AnswerLanguageIssue ("Code:`n``````dart`n// $cjk`n``````")) -eq '') 'code blocks not language-checked'
  $script:calls = 0
  $answer = Get-ChatAnswer 'p' 10 { param($p, $t) $script:calls++; if ($script:calls -eq 1) { $cjk } else { 'Xin chào' } }
  Assert ($answer -eq 'Xin chào' -and $script:calls -eq 2) 'drift retried once in Vietnamese'
  Assert ((Get-ChatAnswer 'p' 10 { param($p, $t) $cjk }) -match '^\[Cảnh báo') 'persistent drift reported'
  Assert (Test-Utf8RoundTrip) 'UTF-8 round trip'

  if ($Live) {
    Section 'live (LM Studio)'
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $report = [Collections.Generic.List[string]]::new()
    $lm = Initialize-LmStudio -Quiet
    $report.Add("# Flutter exam kit live run $(Get-Date -Format 's')"); $report.Add('')
    $report.Add("- LM Studio model: $($lm.id), loaded context $($lm.context), vision: $($lm.vision)")
    $greet = New-Session (Copy-Fixture 'empty-app' (Join-Path $tmp 'greet'))
    for ($i = 1; $i -le 3; $i++) {
      $timer = [Diagnostics.Stopwatch]::StartNew()
      $hello = Get-ChatAnswer (Get-Prompt $greet 'chao') 150
      $issue = Get-AnswerLanguageIssue $hello
      $report.Add("- Greeting ${i}: $([int]$timer.Elapsed.TotalSeconds)s, issue='$issue': $($hello -replace '\s+',' ')")
      Assert ($issue -eq '' -and $hello -notmatch '^\[Cảnh báo') "live greeting $i in Vietnamese"
    }
    $transcribe = { param($image) Invoke-PageTranscription $image }
    $exam02Source = [IO.File]::ReadAllText((Join-Path $pdfDir 'exam-02.txt'))
    $ocrTexts = @{}
    for ($run = 1; $run -le $LiveRuns; $run++) {
      if ($lm.vision) {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $o = Import-ExamPdf (Join-Path $pdfDir 'exam-02-scan.pdf') $transcribe
        $body = ($o.text -replace '^\[Trang 1[^\]]*\]\s*','')
        $score = Get-Similarity $exam02Source $body
        $ocrTexts[$run] = $body
        $report.Add(''); $report.Add("## Scan transcription run $run ($([int]$timer.Elapsed.TotalSeconds)s, word recall $score)")
        $report.Add('```'); $report.Add($body); $report.Add('```')
        Assert ($score -gt 0) "live scan run ${run}: model returned text"
      } else { $report.Add('- Scan transcription: model has no vision; skipped.') }
    }
    $cases = @(
      @{ name='exam-01 (text PDF)'; pdf='exam-01.pdf'; fixture='empty-app'; package='product_app'; screens=@('ProductListScreen','ProductDetailScreen','AddProductScreen')
         model=@{ rel='lib/models/product.dart'; cls='Product' }
         files=@(@{ rel='lib/screens/add_product_screen.dart'; ask='Màn hình AddProductScreen có Form nhập tên và giá: tên không trống, giá là số > 0. Nút Lưu gọi Navigator.pop(context, Product(...)).' },
                 @{ rel='lib/screens/product_detail_screen.dart'; ask='Màn hình ProductDetailScreen (StatelessWidget) lấy Product từ ModalRoute.of(context)!.settings.arguments và hiển thị tên, giá, danh mục.' },
                 @{ rel='lib/screens/product_list_screen.dart'; ask='Màn hình ProductListScreen là StatefulWidget hiển thị List<Product> bằng ListView.builder (tên và giá). Bấm vào dòng gọi Navigator.pushNamed(context, ''/product_detail'', arguments: product).' }) },
      @{ name='exam-02 (scanned PDF via vision)'; pdf='exam-02-scan.pdf'; fixture='empty-app'; package='note_app'; screens=@('LoginScreen','NoteListScreen')
         model=@{ rel='lib/models/note.dart'; cls='Note' }
         files=@(@{ rel='lib/screens/login_screen.dart'; ask='Màn hình LoginScreen có Form với TextFormField email (không trống, phải có @) và mật khẩu (tối thiểu 6 ký tự, obscureText). Đăng nhập hợp lệ thì Navigator.pushReplacementNamed(context, ''/note_list'').' },
                 @{ rel='lib/screens/note_list_screen.dart'; ask='Màn hình NoteListScreen là StatefulWidget hiển thị List<Note> bằng ListView, nút FloatingActionButton thêm ghi chú mới bằng setState.' }) }
    )
    for ($run = 1; $run -le $LiveRuns; $run++) {
      foreach ($case in $cases) {
        $project = Copy-Fixture $case.fixture (Join-Path $tmp "live-$run-$($case.package)")
        $pubPath = Join-Path $project 'pubspec.yaml'
        [IO.File]::WriteAllText($pubPath, ([IO.File]::ReadAllText($pubPath) -replace '(?m)^name: \w+', "name: $($case.package)"))
        $hash = Get-TreeHash $project
        $ls = New-Session $project
        if ($case.pdf -eq 'exam-02-scan.pdf') {
          $examText = if ($ocrTexts[$run]) { $ocrTexts[$run] } else { $exam02Source }
        } else { $examText = (Import-ExamPdf (Join-Path $pdfDir $case.pdf)).text }
        Set-ExamText $ls $examText
        $ls.screens = $case.screens; Save-Session $ls
        $notes = [Collections.Generic.List[string]]::new()
        $jsonSamples = @(Find-JsonSamples $ls.exam)
        if ($jsonSamples.Count) { Save-Draft $ls $case.model.rel (New-DartModelCode $case.model.cls $jsonSamples[0].value) | Out-Null; $notes.Add("model $($case.model.cls): from JSON sample") }
        else { $notes.Add("model $($case.model.cls): no valid JSON sample in the confirmed exam text") }
        foreach ($f in $case.files) {
          $timer = [Diagnostics.Stopwatch]::StartNew()
          try {
            $raw = Invoke-LmChat $script:SystemPrompt (Get-Prompt $ls "Chỉ viết toàn bộ nội dung file $($f.rel) bằng Dart/Flutter, không giải thích, không Markdown. $($f.ask)" $f.rel) 3000
            $fixed = Repair-DartCode (Remove-CodeFence $raw) $f.rel (Get-ProjectModel $ls)
            Save-Draft $ls $f.rel $fixed.code | Out-Null
            $notes.Add("$($f.rel): $([int]$timer.Elapsed.TotalSeconds)s$(if ($fixed.fixes.Count) { ' (sửa: ' + ($fixed.fixes -join '; ') + ')' })")
          } catch { $notes.Add("$($f.rel): FAILED $($_.Exception.Message)") }
        }
        $mainCode = New-MainDartCode (Get-ProjectModel $ls) $case.screens $case.package
        Save-Draft $ls 'lib/main.dart' $mainCode | Out-Null
        $check = @()
        try { $check = @(Test-FlutterChecklist $ls) } catch { $notes.Add("CHECK CRASHED: $($_.Exception.Message)") }
        Assert ($check.Count -gt 0) "live run $run $($case.package): /check completed"
        $keep = Join-Path $PSScriptRoot "results\drafts-$stamp\run$run-$($case.package)"
        New-Item -ItemType Directory -Force -Path $keep | Out-Null
        Copy-Item -Path (Join-Path $script:DraftRoot "$($ls.id)\*") -Destination $keep -Recurse
        $report.Add(''); $report.Add("## Run $run — $($case.name)")
        $notes | ForEach-Object { $report.Add("- $_") }
        $report.Add('```'); $report.Add((Format-Checklist $check)); $report.Add('```')
        Assert ((Get-TreeHash $project) -eq $hash) "live run $run $($case.package): project unchanged"
        Write-Host "  run $run $($case.package): failed-checks=$(@($check | Where-Object { $_.status -eq 'failed' }).Count)"
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
