@echo off
setlocal
chcp 65001 >nul
set "ROOT=%~dp0"
for /f "usebackq delims=" %%M in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%Get-Selected-Model.ps1"`) do set "MODEL=%%M"
if not defined MODEL (
  echo Could not find a selected model. Run Select-Model.cmd.
  pause
  exit /b 1
)
"%ROOT%bin\llama-cli.exe" -m "%MODEL%" -c 8192 -n 2048 --jinja
pause