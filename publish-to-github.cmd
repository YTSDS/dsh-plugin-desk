@echo off
rem Double-click to publish this folder to GitHub (no git required).
rem A GitHub token with "repo" scope is asked for once and never written to disk.
setlocal
set "PS=pwsh"
where pwsh >nul 2>nul || set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" %*
echo.
pause
