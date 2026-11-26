# MHDE (McFez's HomeBrew Development Environment) on Windows, through WSL (Ubuntu on Windows).
#
# Run it by double-clicking "Install on Windows.cmd" in the app's folder,
# or from PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File windows\Install.ps1 [options]
#
#   -Distro <name>   which WSL distro to use (default: your Ubuntu, or a new
#                    Ubuntu-24.04 if you have none)
#   -Mode <m>        window (the default: the app in its own window) or
#                    browser (only if you want it in your web browser instead)
#   -NoDesktop       no desktop shortcut (the Start menu one is always made)
#   -Proxy <url>     the company proxy, e.g. http://proxy.example.com:8080
#                    (normally found by itself, from Windows' own settings)
#   -NoProxy         don't use a proxy even if Windows has one set
#   -Uninstall       removes the shortcuts and the launcher (the app and its
#                    tools stay in WSL; it says how to remove those)
#
# What it does, step by step, asking before anything big:
#   1. WSL: installs it if it's missing (needs administrator rights and a
#      restart; it carries on by itself after you sign back in), and makes
#      sure it's WSL 2 with WSLg, which draws Linux windows on your desktop.
#   2. Ubuntu: uses yours, or installs Ubuntu 24.04 (you pick a Linux user
#      name and password the first time).
#   3. Copies the app into your Linux home (~/cpp-path-workbench): builds and
#      file watching are many times faster there than on the C: drive.
#   4. Inside Ubuntu: the compilers and tools (apt), Node.js 22, the app's
#      packages (scripts/wsl-setup.sh). sudo asks for your Linux password.
#   5. Start menu and desktop shortcuts that start it with no console window.
#
# Nothing here needs to stay where you downloaded it: once installed, the app
# lives in WSL and the launcher in %LOCALAPPDATA%\CppPathWorkbench.

[CmdletBinding()]
param(
    [string]$Distro = '',
    [ValidateSet('auto', 'window', 'browser')][string]$Mode = 'window',
    [switch]$NoDesktop,
    [string]$Proxy = '',
    [switch]$NoProxy,
    [switch]$Uninstall,
    [switch]$Resumed
)

$ErrorActionPreference = 'Stop'
$AppName = 'McFez''s HomeBrew Development Environment (MHDE)'
$OldAppName = 'C++ Path Workbench'                  # the name before; its shortcuts are removed
$LinuxDir = 'cpp-path-workbench'                       # in the Linux home
$Launcher = Join-Path $env:LOCALAPPDATA 'CppPathWorkbench'
$StartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) $AppName
$DesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName.lnk"
$OldLinks = @((Join-Path ([Environment]::GetFolderPath('Programs')) $OldAppName), (Join-Path ([Environment]::GetFolderPath('Desktop')) "$OldAppName.lnk"))
$Source = Split-Path -Parent $PSScriptRoot             # the app's folder (this script is in windows\)
$RunOnceKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'

# wsl.exe prints UTF-16 unless told otherwise
$env:WSL_UTF8 = '1'

function Say([string]$text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Green }
function Warn([string]$text) { Write-Host "!!! $text" -ForegroundColor Yellow }
function Fail([string]$text) { Write-Host ''; Write-Host "XXX $text" -ForegroundColor Red; exit 1 }
function Ask([string]$question) {
    $a = Read-Host "$question [Y/n]"
    return ($a -eq '' -or $a -match '^(y|yes)$')
}

# Run wsl.exe and hand back its output as clean lines (no UTF-16 NULs)
# (A plain function, on purpose: with a param() block PowerShell would read
# wsl's own -d, -e, -v as its common parameters, -Debug, -ErrorAction,
# -Verbose, instead of passing them on. $args passes everything through.)
function Wsl {
    # Windows PowerShell turns a native program's stderr into errors, which
    # 'Stop' would make fatal: wsl.exe writes warnings there
    $ErrorActionPreference = 'Continue'
    $out = & wsl.exe @args 2>&1
    $script:WslExit = $LASTEXITCODE
    return @($out | ForEach-Object { ([string]$_).Replace("`0", '').Trim() } | Where-Object { $_ -ne '' })
}

# A bash command line inside the distro, its output straight to this
# console (so sudo can ask for a password). -e runs bash directly, with no
# shell in between to re-read the quoting.
# (Start-Process keeps the real console, so sudo's password prompt and apt's
# progress work, and only the exit code comes back.) The command never has
# double quotes in it: BashQuote uses single ones.
function InLinux([string]$command) {
    if ($command.Contains('"')) { throw "InLinux: no double quotes, please: $command" }
    $p = Start-Process -FilePath 'wsl.exe' -ArgumentList "-d $script:Distro -e bash -lc `"$command`"" -NoNewWindow -Wait -PassThru
    return $p.ExitCode
}

# A string as a single-quoted bash word
function BashQuote([string]$s) { return "'" + $s.Replace("'", "'\''") + "'" }

# ------------------------------------------------------------------ the company proxy
# The proxy Windows uses for the web, the way your browser finds it: the
# Settings -> Network -> Proxy page (including a setup script / PAC file),
# then WinHTTP's (netsh winhttp). Linux inside WSL doesn't see these by
# itself, so they're handed to the setup.
function FindProxy {
    if ($NoProxy) { return '' }
    if ($Proxy) { return $Proxy }
    foreach ($v in @($env:HTTPS_PROXY, $env:https_proxy, $env:HTTP_PROXY, $env:http_proxy)) { if ($v) { return $v } }
    try {
        $target = [Uri]'https://registry.npmjs.org/'
        $p = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy($target)
        if ($p -and $p.Host -ne $target.Host) { return "http://$($p.Host):$($p.Port)" }
    } catch { }
    try {
        $w = (& netsh.exe winhttp show proxy 2>$null) -join "`n"
        if ($w -match 'Proxy Server\(s\)\s*:\s*(\S+)') {
            $s = $Matches[1]
            if ($s -match 'https=([^;]+)') { $s = $Matches[1] } elseif ($s -match '=') { $s = (($s -split ';')[0] -replace '^[a-z]+=', '') }
            return "http://$s"
        }
    } catch { }
    return ''
}
# Windows' "don't use the proxy for" list, as Linux writes it (*.corp -> .corp)
function ProxyBypass {
    try {
        $o = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction Stop).ProxyOverride
        if (-not $o) { return '' }
        return ((($o -split ';') | Where-Object { $_ -and $_ -ne '<local>' -and $_ -notmatch '[''" ]' } | ForEach-Object { $_ -replace '^\*', '' }) -join ',')
    } catch { return '' }
}
# The certificates Windows trusts, as one PEM file. A proxy that inspects
# HTTPS re-signs every site with the company's own root certificate, which
# IT puts in Windows' store; Ubuntu doesn't have it. The setup adds these
# only if HTTPS fails without them.
function ExportWindowsCerts([string]$file) {
    $now = Get-Date
    $seen = @{}
    $sb = New-Object System.Text.StringBuilder
    foreach ($store in @('Cert:\LocalMachine\Root', 'Cert:\CurrentUser\Root')) {
        foreach ($c in @(Get-ChildItem $store -ErrorAction SilentlyContinue)) {
            if ($c.NotAfter -lt $now -or $seen.ContainsKey($c.Thumbprint)) { continue }
            $seen[$c.Thumbprint] = 1
            [void]$sb.Append("-----BEGIN CERTIFICATE-----`n")
            [void]$sb.Append([Convert]::ToBase64String($c.RawData, 'InsertLineBreaks').Replace("`r", ''))
            [void]$sb.Append("`n-----END CERTIFICATE-----`n")
        }
    }
    [IO.File]::WriteAllText($file, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
    return $seen.Count
}

# ------------------------------------------------------------------ uninstall
if ($Uninstall) {
    Say "Removing the $AppName shortcuts and launcher"
    foreach ($p in (@($StartMenu, $DesktopLink, $Launcher) + $OldLinks)) {
        if (Test-Path -LiteralPath $p) { Remove-Item -Recurse -Force -LiteralPath $p; Write-Host "removed $p" }
    }
    Write-Host ''
    Write-Host 'The app and its tools are still in WSL, with your settings and your code.'
    Write-Host 'To remove the app itself, in Ubuntu:  rm -rf ~/cpp-path-workbench'
    Write-Host 'Its settings and data:                ~/.config/cpp-path-workbench  ~/.local/share/cpp-path-workbench'
    exit 0
}

Write-Host "$AppName for Windows" -ForegroundColor Cyan
Write-Host 'It runs inside WSL (Ubuntu on Windows), so the sanitizers, Valgrind, gdb and the'
Write-Host 'terminal all work exactly as they do on Linux.'

# ------------------------------------------------------------------ 1. WSL
Say 'WSL'
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Fail 'This Windows has no WSL at all. It needs Windows 10 version 2004 (build 19041) or newer; Windows 11 is best (it has WSLg for the window).'
}
$status = Wsl --status
# (WSL with no distros yet also fails --status: that one is handled in step 2)
$wslMissing = ($script:WslExit -ne 0) -and (($status -join ' ') -match 'is not installed|not enabled|optional component|wsl\.exe --install')
if ($wslMissing) {
    Write-Host 'WSL is not turned on yet.'
    if (-not (Ask 'Install WSL now? (Windows asks for administrator rights, then a restart)')) { Fail 'Nothing changed. Run this again when you are ready.' }
    Start-Process -FilePath 'wsl.exe' -ArgumentList '--install', '--no-distribution' -Verb RunAs -Wait
    # carry on by itself after the restart
    $again = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Resumed -Mode $Mode" + ($(if ($NoDesktop) { ' -NoDesktop' } else { '' }))
    if ($Distro) { $again += " -Distro $Distro" }
    New-Item -Path $RunOnceKey -Force | Out-Null
    Set-ItemProperty -Path $RunOnceKey -Name 'CppPathWorkbenchSetup' -Value $again
    Write-Host ''
    Write-Host 'WSL is installed. Restart Windows: this setup starts again by itself when you sign back in.' -ForegroundColor Cyan
    exit 0
}
# The Store version of WSL has WSLg (the window); the old built-in one doesn't
$ver = Wsl --version
if ($script:WslExit -eq 0) {
    Write-Host ($ver | Select-Object -First 1)
    Write-Host 'Updating WSL (this keeps WSLg current)...'
    $null = Wsl --update
} else {
    Warn 'This is the older built-in WSL, without WSLg. Trying to update it to the current one...'
    $null = Wsl --update
    $null = Wsl --version
    if ($script:WslExit -ne 0) { Warn "Couldn't update WSL. The app's window needs WSLg: if it doesn't open, run 'wsl --update' in PowerShell (it may need the Microsoft Store version of WSL)." }
}

# ------------------------------------------------------------------ 2. Ubuntu
Say 'Ubuntu'
$distros = Wsl -l -q
if (-not $Distro) {
    $Distro = @($distros | Where-Object { $_ -match '^Ubuntu' }) | Select-Object -First 1
}
if (-not $Distro -or -not ($distros -contains $Distro)) {
    $want = $(if ($Distro) { $Distro } else { 'Ubuntu-24.04' })
    Write-Host "No $want in WSL yet."
    if (-not (Ask "Install $want? (about 1 GB; you choose a Linux user name and password)")) { Fail 'Nothing changed.' }
    Write-Host 'If you end up at a Linux prompt ($) after choosing your user name, type exit and press Enter.' -ForegroundColor Cyan
    & wsl.exe --install -d $want
    $distros = Wsl -l -q
    if (-not ($distros -contains $want)) { Fail "$want didn't install. Try in PowerShell: wsl --install -d $want, then run this again." }
    $Distro = $want
}
Write-Host "Using $Distro"
# WSLg and the speed need WSL 2
$verbose = Wsl -l -v
$line = $verbose | Where-Object { $_ -match ("(^|\s)" + [regex]::Escape($Distro) + "\s") } | Select-Object -First 1
if ($line -and $line -match '\s1\s*$') {
    Warn "$Distro runs on WSL 1. Converting it to WSL 2 (a few minutes)..."
    & wsl.exe --set-version $Distro 2
}
$linuxUser = (Wsl -d $Distro -e whoami) | Select-Object -Last 1
if ($linuxUser -eq 'root') {
    Warn "$Distro logs in as root. That works, but a normal user is safer: in Ubuntu, 'adduser <name>', then in PowerShell 'ubuntu config --default-user <name>'."
}

# ------------------------------------------------------------------ 3. the app, into the Linux home
Say "The app, into your Linux home (~/$LinuxDir)"
if (-not (Test-Path (Join-Path $Source 'package.json'))) { Fail "Can't find the app next to this script ($Source)." }
$src = (Wsl -d $Distro -e wslpath -a $Source) | Select-Object -Last 1
if (-not $src) { Fail "WSL can't see $Source." }
if ($src -like '/mnt/*') {
    # A copy, so builds run on the Linux disk. node_modules and builds are
    # made fresh in there; your settings and code are elsewhere and untouched.
    $cmd = "set -e; mkdir -p ~/$LinuxDir; cd " + (BashQuote $src) + "; tar --exclude=./node_modules --exclude=./web/dist --exclude=./.git -cf - . | tar -xf - -C ~/$LinuxDir"
    if ((InLinux $cmd) -ne 0) { Fail 'Copying the app into WSL failed.' }
    $appDir = (Wsl -d $Distro -e bash -c "cd ~/$LinuxDir && pwd") | Select-Object -Last 1
    Write-Host "Copied to $appDir"
} else {
    # It's already in the Linux file system (\\wsl.localhost\...): use it there
    $appDir = $src
    Write-Host "Using it where it is: $appDir"
}
# Windows line endings (a git clone on Windows can add them) stop bash cold:
# take them out of the scripts before running any of them
$fix = 'sed -i ''s/\r$//'' ' + (BashQuote "$appDir/scripts") + '/*.sh'
if ((InLinux $fix) -ne 0) { Warn 'Could not check the scripts'' line endings.' }

# ------------------------------------------------------------------ 4. tools and packages, inside Ubuntu
Say 'Compilers, tools, Node.js and the app''s packages (inside Ubuntu)'
Write-Host 'sudo will ask for your Linux password (the one you chose for Ubuntu, not your Windows one).' -ForegroundColor Cyan
$netEnv = ''
$proxyUrl = FindProxy
if ($proxyUrl) {
    Write-Host "Company proxy: $($proxyUrl -replace '//[^@/]*@', '//***@') (from Windows' settings; -Proxy <url> to choose another, -NoProxy for none)"
    $netEnv += 'CPW_PROXY=' + (BashQuote $proxyUrl) + ' '
    $bypass = ProxyBypass
    if ($bypass) { $netEnv += 'CPW_NO_PROXY=' + (BashQuote $bypass) + ' ' }
}
$certFile = Join-Path $env:TEMP 'cpp-path-workbench-windows-roots.pem'
try {
    $n = ExportWindowsCerts $certFile
    $certLinux = (Wsl -d $Distro -e wslpath -a $certFile) | Select-Object -Last 1
    if ($n -gt 0 -and $certLinux) { $netEnv += 'CPW_WINDOWS_CERTS=' + (BashQuote $certLinux) + ' ' }
} catch { Warn "Couldn't read Windows' certificates ($($_.Exception.Message)); carrying on without them." }
$code = InLinux ($netEnv + 'bash ' + (BashQuote "$appDir/scripts/wsl-setup.sh"))
Remove-Item -Force -ErrorAction SilentlyContinue $certFile
if ($code -ne 0) { Fail "Setting up inside Ubuntu failed (exit $code). Fix what it says above, then run this again: it picks up where it left off." }

# ------------------------------------------------------------------ 5. the launcher and shortcuts
Say 'Start menu and desktop'
New-Item -ItemType Directory -Force -Path $Launcher | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'Launch.vbs') $Launcher
Copy-Item -Force (Join-Path $PSScriptRoot 'icon.ico') $Launcher
Copy-Item -Force $PSCommandPath (Join-Path $Launcher 'Install.ps1')
@(
    '; Written by Install.ps1. Mode: window (its own window) or browser (your web browser, only if you want that).',
    "Distro=$Distro",
    "AppDir=$appDir",
    "Mode=$Mode"
) | Set-Content -Encoding ASCII -Path (Join-Path $Launcher 'launcher.ini')

$shell = New-Object -ComObject WScript.Shell
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$vbs = Join-Path $Launcher 'Launch.vbs'
$ico = Join-Path $Launcher 'icon.ico'
function MakeLink([string]$path, [string]$target, [string]$arguments, [string]$description) {
    $l = $shell.CreateShortcut($path)
    $l.TargetPath = $target
    $l.Arguments = $arguments
    $l.WorkingDirectory = $Launcher
    $l.IconLocation = "$ico,0"
    $l.Description = $description
    $l.Save()
}
# the shortcuts from before the app was renamed
foreach ($p in $OldLinks) { if (Test-Path -LiteralPath $p) { Remove-Item -Recurse -Force -LiteralPath $p } }
New-Item -ItemType Directory -Force -Path $StartMenu | Out-Null
MakeLink (Join-Path $StartMenu "$AppName.lnk") $wscript "`"$vbs`"" 'C and C++: editor, build, run, debug, tests, sandbox, guides'
# the app opens in its own window; a browser shortcut only if you asked for one (-Mode browser)
$browserLink = Join-Path $StartMenu "$AppName (in your browser).lnk"
if (Test-Path $browserLink) { Remove-Item -Force $browserLink }
MakeLink (Join-Path $StartMenu "Uninstall $AppName shortcuts.lnk") (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $Launcher 'Install.ps1')`" -Uninstall" 'Removes the shortcuts (the app stays in WSL)'
Write-Host "Start menu: $StartMenu"
if (-not $NoDesktop) {
    MakeLink $DesktopLink $wscript "`"$vbs`"" 'C and C++: editor, build, run, debug, tests, sandbox, guides'
    Write-Host "Desktop:    $DesktopLink"
}

Write-Host ''
Write-Host "Done. Start $AppName from the Start menu or your desktop." -ForegroundColor Cyan
Write-Host 'The first start takes a little longer while WSL wakes up.'
Write-Host 'Your notes vault can stay in Documents or OneDrive: the app finds it there.'
Write-Host 'Keep your code in the Linux home (Files sidebar: ~/...), not on C:, for fast builds.'
Write-Host "To update later: download the new version and run 'Install on Windows.cmd' again."
if (Ask 'Start it now?') { Start-Process -FilePath $wscript -ArgumentList "`"$vbs`"" }
