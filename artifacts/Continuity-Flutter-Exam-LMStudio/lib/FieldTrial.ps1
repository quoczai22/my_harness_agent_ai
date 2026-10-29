# Read-only field-trial measurements for the Flutter exam kit. Dot-source after FlutterExam.ps1.
# Nothing here downloads, installs, writes into a user project, or deletes outside its own trial folder.

$script:TrialTargetRamGB = 8
$script:TrialProcessPattern = '^(LM Studio|lms|llama|lmstudio|dart|dartaotruntime|dartvm|powershell)'

if (-not ('KitTrial.CpuFeatures' -as [type])) {
  Add-Type -Namespace 'KitTrial' -Name 'CpuFeatures' -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(int feature);'
}

function Get-MachineConditions {
  $os = Get-CimInstance Win32_OperatingSystem
  $cs = Get-CimInstance Win32_ComputerSystem
  $cpu = @(Get-CimInstance Win32_Processor)[0]
  return [pscustomobject]@{
    os = "$($os.Caption) $($os.Version)"
    cpu = $cpu.Name.Trim()
    logicalCores = [int]$cs.NumberOfLogicalProcessors
    # PF_AVX2_INSTRUCTIONS_AVAILABLE = 40; the bundled LM Studio runtime needs AVX2.
    avx2 = [KitTrial.CpuFeatures]::IsProcessorFeaturePresent(40)
    ramGB = [Math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
    freeRamGB = [Math]::Round($os.FreePhysicalMemory * 1KB / 1GB, 2)
  }
}
function Get-NetworkEvidence {
  # Observation only: no packets are sent. A profile with Internet connectivity means the PC is not offline.
  $profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ name=$_.Name; interface=$_.InterfaceAlias; ipv4=[string]$_.IPv4Connectivity; ipv6=[string]$_.IPv6Connectivity } })
  $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { "$($_.Name) ($($_.InterfaceDescription))" })
  $internet = @($profiles | Where-Object { $_.ipv4 -eq 'Internet' -or $_.ipv6 -eq 'Internet' }).Count -gt 0
  return [pscustomobject]@{ offline=!$internet; adaptersUp=$adapters; profiles=$profiles }
}
function Get-PathEvidence {
  $found = [ordered]@{}
  foreach ($tool in @('flutter','dart','git')) {
    $cmd = Get-Command $tool -ErrorAction SilentlyContinue
    $found[$tool] = if ($cmd) { $cmd.Source } else { '' }
  }
  return [pscustomobject]@{ clean=!(@($found.Values | Where-Object { $_ }).Count); tools=$found }
}
function Test-KitIntegrity([string]$kitRoot) {
  $manifestPath = Join-Path $kitRoot 'manifest.json'
  if (!(Test-Path -LiteralPath $manifestPath)) { return [pscustomobject]@{ ok=$false; checked=0; problems=@('manifest.json không có') } }
  $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
  $problems = [Collections.Generic.List[string]]::new(); $checked = 0
  foreach ($f in @($manifest.files)) {
    $path = Join-Path $kitRoot $f.path.Replace('/','\')
    $checked++
    if (!(Test-Path -LiteralPath $path)) { $problems.Add("thiếu $($f.path)"); continue }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.sha256) { $problems.Add("khác mã băm $($f.path)") }
  }
  $dart = Join-Path $kitRoot 'sdk\flutter\bin\cache\dart-sdk\bin\dart.exe'
  if (!(Test-Path -LiteralPath $dart)) { $problems.Add('thiếu SDK đi kèm (sdk\flutter)') }
  if (!(Test-Path -LiteralPath (Join-Path $kitRoot 'tools\pdf\pdftotext.exe'))) { $problems.Add('thiếu tools\pdf\pdftotext.exe') }
  return [pscustomobject]@{ ok=!$problems.Count; checked=$checked; problems=@($problems | Select-Object -First 20) }
}

# ---------------------------------------------------------------- memory per phase

function Measure-TrialPhase([string]$name, [scriptblock]$Action, [int]$IntervalMs = 500) {
  # A background runspace samples working sets while the phase runs; the phase itself runs here.
  $state = [hashtable]::Synchronized(@{ stop=$false; peakTotalMB=0.0; peakByProcess=@{}; minFreeMB=[double]::MaxValue; samples=0 })
  $ps = [PowerShell]::Create()
  $null = $ps.AddScript({
    param($state, $pattern, $interval)
    while (-not $state.stop) {
      $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match $pattern })
      $total = 0.0
      foreach ($group in ($procs | Group-Object ProcessName)) {
        $mb = [Math]::Round((($group.Group | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 1)
        $total += $mb
        if (-not $state.peakByProcess.ContainsKey($group.Name) -or $state.peakByProcess[$group.Name] -lt $mb) { $state.peakByProcess[$group.Name] = $mb }
      }
      if ($total -gt $state.peakTotalMB) { $state.peakTotalMB = $total }
      $free = [Math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB, 0)
      if ($free -lt $state.minFreeMB) { $state.minFreeMB = $free }
      $state.samples++
      Start-Sleep -Milliseconds $interval
    }
  }).AddArgument($state).AddArgument($script:TrialProcessPattern).AddArgument($IntervalMs)
  $handle = $ps.BeginInvoke()
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $result = $null; $errorText = ''
  try { $result = & $Action } catch { $errorText = $_.Exception.Message }
  finally {
    $timer.Stop()
    Start-Sleep -Milliseconds ([Math]::Min($IntervalMs, 600))
    $state.stop = $true
    try { $ps.EndInvoke($handle) | Out-Null } catch { }
    $ps.Dispose()
  }
  return [pscustomobject]@{
    name=$name; seconds=[Math]::Round($timer.Elapsed.TotalSeconds, 1); result=$result; error=$errorText
    peakTotalMB=$state.peakTotalMB; peakByProcess=$state.peakByProcess.Clone(); minFreeMB=$(if ($state.samples) { $state.minFreeMB } else { $null }); samples=$state.samples
  }
}

# ---------------------------------------------------------------- OCR accuracy

function Get-WordRecall([string]$truth, [string]$ocr) {
  $norm = { param($t) @(($t.ToLowerInvariant() -replace '[^\p{L}\p{N}@]+',' ').Split(' ', [StringSplitOptions]::RemoveEmptyEntries)) }
  $src = & $norm $truth; $got = & $norm $ocr
  if (!$src.Count) { return 0 }
  $bag = @{}; foreach ($w in $got) { $bag[$w] = 1 + [int]$bag[$w] }
  $hit = 0; foreach ($w in $src) { if ([int]$bag[$w] -gt 0) { $hit++; $bag[$w]-- } }
  return [Math]::Round($hit / $src.Count, 3)
}
function Get-CriticalFacts([string]$truth) {
  # Facts whose misreading changes the code: numbers, class/screen names, routes, JSON keys, '@'.
  $facts = [Collections.Generic.List[object]]::new()
  $add = { param($kind, $value) if ($value -and !@($facts | Where-Object { $_.kind -eq $kind -and $_.value -ceq $value }).Count) { $facts.Add([pscustomobject]@{ kind=$kind; value=$value }) } }
  foreach ($m in [regex]::Matches($truth, '\b[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+\b')) { & $add 'tên lớp' $m.Value }
  foreach ($m in [regex]::Matches($truth, "['""](/[\w/-]*)['""]")) { & $add 'route' $m.Groups[1].Value }
  foreach ($m in [regex]::Matches($truth, '"(\w+)"\s*:')) { & $add 'khóa JSON' $m.Groups[1].Value }
  foreach ($m in [regex]::Matches($truth, '(?<![\w.])\d+(?:[.,]\d+)?(?![\w.])')) { & $add 'số' $m.Value }
  if ($truth.Contains('@')) { & $add 'ký tự' '@' }
  return @($facts)
}
function Compare-Transcript([string]$truth, [string]$ocr) {
  $facts = @(Get-CriticalFacts $truth | ForEach-Object {
    $found = if ($_.kind -eq 'số') { [regex]::IsMatch($ocr, '(?<![\w.])' + [regex]::Escape($_.value) + '(?![\w.])') } else { $ocr.Contains($_.value) }
    [pscustomobject]@{ kind=$_.kind; value=$_.value; found=$found }
  })
  $ok = @($facts | Where-Object { $_.found }).Count
  return [pscustomobject]@{
    wordRecall = Get-WordRecall $truth $ocr
    factsFound = $ok; factsTotal = $facts.Count
    factAccuracy = $(if ($facts.Count) { [Math]::Round($ok / $facts.Count, 3) } else { $null })
    missing = @($facts | Where-Object { !$_.found } | ForEach-Object { "$($_.kind): $($_.value)" })
  }
}

# ---------------------------------------------------------------- verdict

function Get-TrialVerdict($machine, $network, $path, $kit, [bool]$phonePhoto, [bool]$hasTranscript, [bool]$hasLmStudio) {
  # The field trial counts only when every target condition is observed; otherwise it is "not run",
  # and the measurements are a dry run that must not be read as target-machine acceptance.
  $conditions = @(
    [pscustomobject]@{ item="RAM ≤ $($script:TrialTargetRamGB) GB (máy đích)"; met=($machine.ramGB -le $script:TrialTargetRamGB + 0.5); detail="$($machine.ramGB) GB" },
    [pscustomobject]@{ item='CPU có AVX2'; met=[bool]$machine.avx2; detail=$machine.cpu },
    [pscustomobject]@{ item='Ngắt mạng (không có kết nối Internet)'; met=[bool]$network.offline; detail=$(if ($network.offline) { 'không thấy kết nối Internet' } else { 'đang có kết nối Internet' }) },
    [pscustomobject]@{ item='Máy sạch: không có flutter/dart/git trong PATH'; met=[bool]$path.clean; detail=((@($path.tools.Keys) | Where-Object { $path.tools[$_] } | ForEach-Object { "$_=$($path.tools[$_])" }) -join '; ') },
    [pscustomobject]@{ item='Kit nguyên vẹn theo manifest'; met=[bool]$kit.ok; detail="$($kit.checked) file; $(@($kit.problems) -join '; ')" },
    [pscustomobject]@{ item='LM Studio và model chạy được'; met=$hasLmStudio; detail='' },
    [pscustomobject]@{ item='PDF ghép từ ảnh chụp điện thoại'; met=$phonePhoto; detail=$(if ($phonePhoto) { 'người chạy xác nhận' } else { 'chưa có (dùng PDF khác)' }) },
    [pscustomobject]@{ item='Có bản chép tay đề đã được người xác nhận'; met=$hasTranscript; detail='' }
  )
  $allMet = !@($conditions | Where-Object { !$_.met }).Count
  return [pscustomobject]@{ status=$(if ($allMet) { 'run' } else { 'not run' }); conditions=$conditions }
}
