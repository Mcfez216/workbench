@echo off
rem MHDE (McFez's HomeBrew Development Environment) for Windows: double-click this.
rem It sets up WSL (Ubuntu on Windows) if needed, installs the app and its
rem tools there, and puts MHDE in your Start menu and on your
rem desktop. Read windows\Install.ps1 first if you like: it's plain text.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Install.ps1" %*
echo.
pause
