param(
  [Parameter(Mandatory=$true)][string]$Model,
  [Parameter(Mandatory=$true)][string]$PromptFile,
  [int]$Context = 12288,
  [int]$MaxTokens = 2048,
  [string]$SystemFile = ''
)

$root = $PSScriptRoot
$system = @()
if ($SystemFile) { $system = @('-sysf', $SystemFile) }
$output = (& (Join-Path $root 'bin\llama-cli.exe') -m $Model -c $Context -n $MaxTokens -st --jinja --no-display-prompt @system -f $PromptFile 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw "llama-cli stopped with exit code $LASTEXITCODE." }
$output = $output.Replace("`r`n", "`n")

# This llama-cli build echoes a preview of the prompt even with --no-display-prompt.
$marker = '... (truncated)'
$start = $output.LastIndexOf($marker, [StringComparison]::Ordinal)
if ($start -ge 0) {
  $answer = $output.Substring($start + $marker.Length)
} else {
  $prompt = [IO.File]::ReadAllText($PromptFile).Replace("`r`n", "`n")
  $start = $output.LastIndexOf($prompt, [StringComparison]::Ordinal)
  if ($start -lt 0) { throw 'Could not separate llama-cli prompt from its answer.' }
  $answer = $output.Substring($start + $prompt.Length)
}
$end = $answer.IndexOf('[ Prompt:', [StringComparison]::Ordinal)
if ($end -ge 0) { $answer = $answer.Substring(0, $end) }
$answer = $answer.Trim()
if (!$answer) { throw 'llama-cli returned no answer.' }
Write-Output $answer
