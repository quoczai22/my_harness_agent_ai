# LM Studio client: loopback only, no cloud fallback, no downloads. Dot-source this file.

$script:LmConfig = [pscustomobject]@{ baseUrl='http://127.0.0.1:1234'; model='qwen3.5-2b'; contextLength=8192 }

function Import-LmConfig([string]$path) {
  if (!(Test-Path -LiteralPath $path)) { return }
  $raw = [IO.File]::ReadAllText($path) | ConvertFrom-Json
  foreach ($name in @('baseUrl','model','contextLength')) {
    if ($raw.PSObject.Properties[$name] -and $raw.$name) { $script:LmConfig.$name = $raw.$name }
  }
}
function Test-LoopbackUrl([string]$url) {
  $uri = $null
  if (![Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri)) { return $false }
  # IsLoopback covers 127.x, localhost and ::1 (which .NET Framework expands to [0000:...:0001]).
  return ($uri.Scheme -eq 'http' -and $uri.IsLoopback -and
    !$uri.UserInfo -and !$uri.Query -and !$uri.Fragment -and $uri.AbsolutePath -in @('/','/v1','/v1/'))
}
function Get-LmOrigin {
  if (!(Test-LoopbackUrl $script:LmConfig.baseUrl)) { throw "Chỉ cho phép LM Studio trên máy này (127.0.0.1/localhost). Địa chỉ bị từ chối: $($script:LmConfig.baseUrl)" }
  return ([Uri]$script:LmConfig.baseUrl).GetLeftPart([UriPartial]::Authority)
}
function ConvertTo-LmError([string]$status, [string]$body) {
  if (!$status) { return 'Không kết nối được LM Studio. Mở LM Studio hoặc chạy: lms server start' }
  if ($body -match '(?i)context|too long|exceeds') { return 'Nội dung quá dài so với ngữ cảnh của model. Hỏi theo từng câu hoặc bớt file đính kèm.' }
  if ($body -match '(?i)no models? loaded|model.*not.*(found|loaded)|failed to load') { return "Model chưa được nạp. Chạy: lms load $($script:LmConfig.model) -y -c $($script:LmConfig.contextLength)" }
  return "LM Studio trả lỗi HTTP ${status}: $(if ($body.Length -gt 300) { $body.Substring(0,300) } else { $body })"
}
function Invoke-LmHttp([string]$method, [string]$path, $body = $null, [int]$timeoutSec = 60) {
  # HttpWebRequest instead of Invoke-RestMethod: PowerShell 5.1 decodes charset-less JSON as Latin-1.
  $request = [Net.HttpWebRequest]::Create((Get-LmOrigin) + $path)
  $request.Method = $method
  $request.Proxy = $null
  $request.Timeout = $timeoutSec * 1000
  $request.ReadWriteTimeout = $timeoutSec * 1000
  if ($null -ne $body) {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes((ConvertTo-Json -InputObject $body -Depth 20 -Compress))
    $request.ContentType = 'application/json; charset=utf-8'
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
  }
  try {
    $response = $request.GetResponse()
  } catch [Net.WebException] {
    $status = ''; $text = ''
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream(), [Text.Encoding]::UTF8)
      try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
    } elseif ($_.Exception.Status -eq [Net.WebExceptionStatus]::Timeout) {
      throw "LM Studio không trả lời sau $timeoutSec giây. Máy có thể quá chậm; hỏi ngắn hơn."
    }
    throw (ConvertTo-LmError $status $text)
  }
  $reader = [IO.StreamReader]::new($response.GetResponseStream(), [Text.Encoding]::UTF8)
  try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose(); $response.Dispose() }
}
function Get-LmModelState {
  # LM Studio's native listing reports type (llm/vlm/embeddings) and load state; /v1/models does not.
  $list = Invoke-LmHttp 'GET' '/api/v0/models' $null 10
  $model = @($list.data | Where-Object { $_.id -eq $script:LmConfig.model } | Select-Object -First 1)
  if (!$model.Count) { $model = @($list.data | Where-Object { $_.type -in @('llm','vlm') -and $_.state -eq 'loaded' } | Select-Object -First 1) }
  if (!$model.Count) { return [pscustomobject]@{ id=''; loaded=$false; vision=$false; context=0 } }
  return [pscustomobject]@{ id=$model[0].id; loaded=($model[0].state -eq 'loaded'); vision=($model[0].type -eq 'vlm'); context=[int]$model[0].loaded_context_length }
}
function Invoke-NativeQuiet([string]$exe, [string[]]$arguments) {
  # Under ErrorActionPreference=Stop, PowerShell 5.1 turns any native stderr line into a terminating error.
  $ErrorActionPreference = 'Continue'
  $output = @(& $exe @arguments 2>&1 | ForEach-Object { "$_" })
  return [pscustomobject]@{ exitCode=$LASTEXITCODE; output=$output }
}
function Find-LmsCli {
  $cmd = Get-Command lms -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $local = Join-Path $env:USERPROFILE '.lmstudio\bin\lms.exe'
  if (Test-Path -LiteralPath $local) { return $local }
  return ''
}
function Initialize-LmStudio([switch]$Quiet) {
  $state = $null
  try { $state = Get-LmModelState } catch {
    $lms = Find-LmsCli
    if (!$lms) { throw 'LM Studio chưa chạy và không tìm thấy lệnh lms. Cài LM Studio theo OFFLINE-SETUP.md của kit LM Studio rồi bật Local Server.' }
    if (!$Quiet) { Write-Host 'Đang bật LM Studio server (127.0.0.1)...' }
    Invoke-NativeQuiet $lms @('server','start','--port',[string]([Uri]$script:LmConfig.baseUrl).Port) | Out-Null
    $state = Get-LmModelState
  }
  if (!$state.loaded) {
    $lms = Find-LmsCli
    if (!$lms) { throw "Model chưa nạp. Trong LM Studio, nạp $($script:LmConfig.model) rồi chạy lại." }
    if (!$Quiet) { Write-Host "Đang nạp model $($script:LmConfig.model)..." }
    Invoke-NativeQuiet $lms @('load',$script:LmConfig.model,'-y','-c',[string]$script:LmConfig.contextLength) | Out-Null
    $state = Get-LmModelState
    if (!$state.loaded) { throw "Không nạp được model $($script:LmConfig.model)." }
  }
  return $state
}
function Remove-ThinkBlock([string]$text) {
  return ([regex]::Replace($text, '(?s)<think>.*?</think>', '')).Trim()
}
function Invoke-LmChat([string]$system, [string]$user, [int]$maxTokens = 1200, [string[]]$imagePaths = @(), [int]$timeoutSec = 300) {
  $content = $user
  if ($imagePaths.Count) {
    $parts = [Collections.Generic.List[object]]::new()
    $parts.Add(@{ type='text'; text=$user })
    foreach ($img in $imagePaths) {
      $data = [Convert]::ToBase64String([IO.File]::ReadAllBytes($img))
      $parts.Add(@{ type='image_url'; image_url=@{ url="data:image/png;base64,$data" } })
    }
    $content = $parts.ToArray()
  }
  $body = [ordered]@{
    model = $script:LmConfig.model
    messages = @(@{ role='system'; content=$system }, @{ role='user'; content=$content })
    max_tokens = $maxTokens; temperature = 0.2; stream = $false
    # Qwen3.5 otherwise spends the whole token budget in reasoning_content and returns empty content.
    reasoning_effort = 'none'
  }
  $result = Invoke-LmHttp 'POST' '/v1/chat/completions' $body $timeoutSec
  $answer = Remove-ThinkBlock ([string]$result.choices[0].message.content)
  if (!$answer) { throw 'Model không trả nội dung (có thể hết token khi đang suy nghĩ). Hỏi ngắn hơn.' }
  if ($result.choices[0].finish_reason -eq 'length') { $answer += "`n[Bị cắt do giới hạn độ dài; hỏi tiếp phần còn lại.]" }
  return $answer
}
