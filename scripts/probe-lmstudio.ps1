param(
  [string]$ModelId,
  [string]$Endpoint = 'http://127.0.0.1:1234'
)

$ErrorActionPreference = 'Stop'
$uri = [Uri]$Endpoint
if ($uri.Scheme -ne 'http' -or $uri.Host -notin @('127.0.0.1', 'localhost', '::1') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -notin @('/', '/v1', '/v1/')) {
  throw 'Only a local LM Studio HTTP endpoint is allowed.'
}
$base = $uri.GetLeftPart([System.UriPartial]::Authority) + '/v1'
$models = Invoke-RestMethod -Uri "$base/models" -Method Get -TimeoutSec 5 -MaximumRedirection 0
$ids = @($models.data | ForEach-Object { $_.id } | Where-Object { $_ })
if ($ids.Count -eq 0) { throw 'LM Studio server is running, but no model is visible. Load a local model first.' }
Write-Output ('Visible model IDs: ' + ($ids -join ', '))
if (-not $ModelId) { Write-Output 'Pass -ModelId to run the local coding probe.'; return }
if ($ModelId -notin $ids) { throw "Configured model '$ModelId' is not visible to the local server." }
$body = @{
  model = $ModelId
  stream = $false
  messages = @(@{ role = 'user'; content = 'Write a short C# function that returns true when an integer is even. Return code only.' })
} | ConvertTo-Json -Depth 6
$timer = [System.Diagnostics.Stopwatch]::StartNew()
$response = Invoke-RestMethod -Uri "$base/chat/completions" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 120 -MaximumRedirection 0
$timer.Stop()
if (-not $response.choices[0].message.content) { throw 'Local model returned no text.' }
Write-Output ('Latency seconds: ' + [Math]::Round($timer.Elapsed.TotalSeconds, 2))
Write-Output ('Model response: ' + $response.choices[0].message.content)
Write-Output 'Measure peak RAM in Task Manager during a longer code/image request on the 8 GB target PC.'
