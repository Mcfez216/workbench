@echo off
rem MHDE (McFez's HomeBrew Development Environment) for Windows WITHOUT WSL: double-click this.
rem It downloads a portable C/C++ toolchain (clang with the sanitizers, gdb,
rem CMake, Ninja, Git, Node.js) into your own user folder - no administrator
rem rights - installs the app next to it, and puts it in your Start menu.
rem Read windows\Install-Native.ps1 first if you like: it's plain text.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Install-Native.ps1" %*
echo.
pause
