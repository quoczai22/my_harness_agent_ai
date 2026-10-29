$model = Join-Path $PSScriptRoot 'models\qwen2.5-coder-3b-instruct-q6_k.gguf'
if (!(Test-Path -LiteralPath $model)) { throw "Bundled 3GB model is missing: $model" }
Write-Output $model
