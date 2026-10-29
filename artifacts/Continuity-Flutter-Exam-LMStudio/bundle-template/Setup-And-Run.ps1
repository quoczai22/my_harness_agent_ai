param([switch]$NoLaunch, [switch]$FullVerify)
# One click for the Flutter exam bundle: set up LM Studio offline if needed, load the model, open the kit.
# Safe to run again: finished steps are skipped. No downloads, no admin rights.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = $PSScriptRoot
$kit = Join-Path $root 'kit'
$lmDir = Join-Path $root 'lmstudio'
. (Join-Path $kit 'lib\FlutterExam.ps1')
. (Join-Path $kit 'lib\BundleSetup.ps1')
Import-LmConfig (Join-Path $kit 'config.json')

$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("setup-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
function Write-Log([string]$text) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $text"
  Write-Host $line
  [IO.File]::AppendAllText($log, $line + "`r`n", [Text.UTF8Encoding]::new($false))
}
function Stop-Setup([string]$text) { Write-Log "DỪNG: $text"; throw $text }
function Wait-Until([scriptblock]$Condition, [int]$Seconds) {
  for ($i = 0; $i -lt $Seconds; $i++) { if (& $Condition) { return $true }; Start-Sleep -Seconds 1 }
  return [bool](& $Condition)
}

try {
  Write-Log 'Bắt đầu. Hãy ngắt mạng (tắt Wi-Fi, rút cáp) nếu đang chuẩn bị cho phòng thi.'

  # 1. Machine
  if (![Environment]::Is64BitOperatingSystem) { Stop-Setup 'Cần Windows 64-bit.' }
  if (![KitBundle.CpuFeatures]::IsProcessorFeaturePresent(40)) { Stop-Setup 'CPU không có AVX2; runtime đi kèm không chạy được trên máy này.' }
  $ramGB = [Math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
  if ($ramGB -lt 7.5) { Write-Log "CẢNH BÁO: RAM $ramGB GB, dưới 8 GB; model có thể chạy rất chậm hoặc không nạp được." } else { Write-Log "RAM: $ramGB GB." }
  $drive = Get-PSDrive -Name ($env:LOCALAPPDATA.Substring(0,1)) -ErrorAction SilentlyContinue
  if ($drive -and $drive.Free -lt 3GB) { Write-Log "CẢNH BÁO: ổ $($drive.Name): chỉ còn $([Math]::Round($drive.Free / 1GB, 1)) GB trống." }

  # 2. Bundle integrity (full hash on first run or when asked; size check afterwards)
  $manifestPath = Join-Path $root 'bundle-manifest.json'
  $marker = Join-Path $logDir 'verified.json'
  $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
  $verifiedBefore = (Test-Path -LiteralPath $marker) -and (([IO.File]::ReadAllText($marker) | ConvertFrom-Json).manifest -eq $manifestHash)
  $full = $FullVerify -or !$verifiedBefore
  Write-Log $(if ($full) { 'Kiểm tra bộ cài (đầy đủ, mã băm; vài phút)...' } else { 'Kiểm tra nhanh bộ cài...' })
  $check = Test-BundleManifest $root -Full:$full
  if (!$check.ok) { Stop-Setup ("Bộ cài bị thiếu hoặc hỏng: " + ($check.problems -join '; ')) }
  if ($full) { [IO.File]::WriteAllText($marker, (ConvertTo-Json @{ manifest=$manifestHash; at=(Get-Date -Format 's') }), [Text.UTF8Encoding]::new($false)) }

  # 3. LM Studio app
  $lmExe = Find-LmStudioExe
  if (!$lmExe) {
    $installer = Join-Path $lmDir 'installer\LM-Studio-Windows-x64.exe'
    Write-Log 'Chưa có LM Studio: cài im lặng cho tài khoản này (không cần admin, 1-3 phút)...'
    Start-Process -FilePath $installer -ArgumentList (Get-LmStudioInstallerArguments) -Wait | Out-Null
    if (!(Wait-Until { Find-LmStudioExe } 300)) {
      Write-Log 'Cài im lặng không thành công; mở trình cài đặt thường. Hãy bấm Next/Install đến khi xong.'
      Start-Process -FilePath $installer -Wait | Out-Null
    }
    $lmExe = Find-LmStudioExe
    if (!$lmExe) { Stop-Setup 'Không cài được LM Studio.' }
    Write-Log "Đã cài LM Studio: $lmExe"
  } else { Write-Log "LM Studio đã có: $lmExe" }

  # 4. lms command (created when LM Studio starts for the first time)
  $lmHome = Get-LmStudioHome
  $lms = Get-LmsExe $lmHome
  $settings = Join-Path $lmHome 'settings.json'
  $startedGui = $null
  if (!(Test-Path -LiteralPath $lms) -or !(Test-Path -LiteralPath $settings)) {
    Write-Log 'Mở LM Studio lần đầu để tạo lệnh lms (tối đa 2 phút)...'
    $startedGui = Start-Process -FilePath $lmExe -PassThru
    if (!(Wait-Until { (Test-Path -LiteralPath $lms) -and (Test-Path -LiteralPath $settings) } 120)) { Stop-Setup 'LM Studio không tạo lệnh lms. Mở LM Studio thủ công một lần rồi chạy lại.' }
  }

  # 5. CPU runtime
  $runtimeList = (Invoke-NativeQuiet $lms @('runtime','ls')).output -join "`n"
  $runtimeId = "$($script:BundleRuntimeName)@$($script:BundleRuntimeVersion)"
  if (!(Test-RuntimeListed $runtimeList)) {
    $source = Join-Path $lmDir "runtime\$($script:BundleRuntimeName)-$($script:BundleRuntimeVersion)"
    $target = Join-Path $lmHome "extensions\backends\$($script:BundleRuntimeName)-$($script:BundleRuntimeVersion)"
    Write-Log "Chép runtime $runtimeId..."
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
    foreach ($f in Get-ChildItem -LiteralPath $source -File -Recurse) {
      $copy = Join-Path $target $f.FullName.Substring($source.Length).TrimStart('\')
      if (!(Test-Path -LiteralPath $copy) -or (Get-FileHash -LiteralPath $copy).Hash -ne (Get-FileHash -LiteralPath $f.FullName).Hash) { Stop-Setup "Chép runtime sai: $copy" }
    }
    $runtimeList = (Invoke-NativeQuiet $lms @('runtime','ls')).output -join "`n"
    if (!(Test-RuntimeListed $runtimeList)) { Stop-Setup 'Đã chép runtime nhưng LM Studio không nhận.' }
  } else { Write-Log "Runtime $runtimeId đã có." }
  if (!(Test-GgufEngineSelected $runtimeList)) {
    Write-Log "Chọn runtime $runtimeId cho model GGUF."
    Invoke-NativeQuiet $lms @('runtime','select',$runtimeId) | Out-Null
  }

  # 6. Point LM Studio at the bundled models (no copy)
  $models = Join-Path $lmDir 'models'
  $current = Get-ModelsFolderSetting $settings
  if (!$current -or ([IO.Path]::GetFullPath($current).TrimEnd('\') -ine [IO.Path]::GetFullPath($models).TrimEnd('\'))) {
    if ($startedGui -and !$startedGui.HasExited) { Write-Log 'Đóng cửa sổ LM Studio do bước trước mở.'; Stop-Process -Id $startedGui.Id -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3 }
    if (@(Get-Process -Name 'LM Studio' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count) {
      Stop-Setup 'LM Studio đang mở. Hãy đóng cửa sổ LM Studio rồi chạy lại (cần đổi thư mục model).'
    }
    Invoke-NativeQuiet $lms @('server','stop') | Out-Null
    Invoke-NativeQuiet $lms @('daemon','down') | Out-Null
    $change = Set-ModelsFolderSetting $settings $models
    Write-Log "Đã trỏ LM Studio vào thư mục model của bộ cài. Bản sao lưu cấu hình cũ: $($change.backup)"
    # daemon down does not unload models; one still loaded from the old folder would otherwise be reused.
    Invoke-NativeQuiet $lms @('unload','--all') | Out-Null
    Write-Log 'Đã gỡ các model đang nạp để nạp lại từ thư mục của bộ cài.'
  } else { Write-Log 'Thư mục model đã đúng.' }

  # 7. Server + model
  Write-Log 'Bật server và nạp model (lần đầu có thể mất 1-2 phút)...'
  $state = Initialize-LmStudio -Quiet
  if (!$state.loaded) { Stop-Setup "Không nạp được model $($script:LmConfig.model)." }
  Write-Log "Sẵn sàng: model $($state.id), ngữ cảnh $($state.context), đọc ảnh: $($state.vision)."
} catch {
  Write-Host ''
  Write-Host "Không hoàn tất được. Chi tiết trong: $log"
  exit 1
}

if (!$NoLaunch) {
  Write-Log 'Mở kit Flutter.'
  & (Join-Path $kit 'Flutter-Exam.ps1')
}
