@echo off
rem Install this plugin into the DSH desktop profile (installed = enabled).
setlocal
set "PKG=%~dp0.."
set "CLI=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"

if not exist "%CLI%" (
  echo [x] DSH CLI not found: %CLI%
  echo     Make sure DeepSeek Harness is installed in the default location.
  pause
  exit /b 1
)

echo Installing into profile: desktop ...
call "%CLI%" plugin --profile desktop add "%PKG%"
if errorlevel 1 (
  echo [x] Install failed.
  pause
  exit /b 1
)

echo.
echo Done. Open DSH, sidebar "Plugins", there should be a "Plugin Desk" tab.
echo If it is missing, quit DSH completely and start it again.
pause
