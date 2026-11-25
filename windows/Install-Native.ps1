# C++ Path Workbench on Windows, WITHOUT WSL: the Windows version.
#
# Run it by double-clicking "Install on Windows (no WSL).cmd" in the app's
# folder, or from PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File windows\Install-Native.ps1 [options]
#
#   -Proxy <url>        the company proxy, e.g. http://proxy.example.com:8080
#                       (normally found by itself, from Windows' own settings)
#   -NoProxy            don't use a proxy even if Windows has one set
#   -Downloads <folder> where the downloads are kept; put files there by hand
#                       if the network blocks a download, and run this again
#   -NoDesktop          no desktop shortcut
#   -Uninstall          removes the app, its tools and the shortcuts
#                       (your settings, notes and code stay)
#
# No administrator rights, nothing outside your own user folders. Everything
# goes in %LOCALAPPDATA%\CppPathWorkbenchNative:
#   tools\node        Node.js (runs the setup and the app's helpers)
#   tools\llvm-mingw  clang and clang++ with AddressSanitizer and UBSan, lldb
#   tools\w64devkit   gcc, gdb (debugging, the memory view), make, and a small
#                     Unix shell with ls, grep, cat... so the guides' commands work
#   tools\cmake, tools\ninja, tools\mingit   CMake, Ninja and Git
#   app               the app itself, with its own Electron window
# Each download is a pinned version, checked against the SHA-256 its project
# publishes (Node.js's SHASUMS256.txt, GitHub's release digests).
#
# Different from the WSL version: no Valgrind (the sanitizers find the same
# bugs), no LeakSanitizer, and the binary inspector in the security lab
# reads Linux programs only.

[CmdletBinding()]
param(
    [string]$Proxy = '',
    [switch]$NoProxy,
    [string]$Downloads = '',
    [switch]$NoDesktop,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'      # Invoke-WebRequest is many times faster without its progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
# A proxy that wants your Windows sign-in gets it, as your browser's does
[Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

$AppName = 'C++ Path Workbench'
$Root = Join-Path $env:LOCALAPPDATA 'CppPathWorkbenchNative'
$Tools = Join-Path $Root 'tools'
$App = Join-Path $Root 'app'
$Cache = if ($Downloads) { $Downloads } else { Join-Path $Root 'downloads' }
$CertFile = Join-Path $Root 'windows-roots.pem'
$StartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) "$AppName (Windows)"
$DesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName (Windows).lnk"
$Source = Split-Path -Parent $PSScriptRoot

function Say([string]$text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Green }
function Warn([string]$text) { Write-Host "!!! $text" -ForegroundColor Yellow }
function Fail([string]$text) { Write-Host ''; Write-Host "XXX $text" -ForegroundColor Red; exit 1 }
function Ask([string]$question) {
    $a = Read-Host "$question [Y/n]"
    return ($a -eq '' -or $a -match '^(y|yes)$')
}

# The pinned versions. To update one: change its version here (the checksum
# is looked up, not written down).
$Pins = @(
    @{ Name = 'node'; File = 'node-v26.13.1-win-x64.zip'; Top = 'node-v26.13.1-win-x64'
       Url = 'https://nodejs.org/dist/v26.13.1/node-v26.13.1-win-x64.zip'; Sums = 'https://nodejs.org/dist/v26.13.1/SHASUMS256.txt' },
    @{ Name = 'llvm-mingw'; File = 'llvm-mingw-20261117-ucrt-x86_64.zip'; Top = 'llvm-mingw-20261117-ucrt-x86_64'
       Url = 'https://github.com/mstorsjo/llvm-mingw/releases/download/20261117/llvm-mingw-20261117-ucrt-x86_64.zip'; Repo = 'mstorsjo/llvm-mingw'; Tag = '20261117' },
    @{ Name = 'w64devkit'; File = 'w64devkit-x64-2.9.1.7z.exe'; Top = 'w64devkit'; Sfx = $true
       Url = 'https://github.com/skeeto/w64devkit/releases/download/v2.9.1/w64devkit-x64-2.9.1.7z.exe'; Repo = 'skeeto/w64devkit'; Tag = 'v2.9.1' },
    @{ Name = 'cmake'; File = 'cmake-4.5.1-windows-x86_64.zip'; Top = 'cmake-4.5.1-windows-x86_64'
       Url = 'https://github.com/Kitware/CMake/releases/download/v4.5.1/cmake-4.5.1-windows-x86_64.zip'; Repo = 'Kitware/CMake'; Tag = 'v4.5.1' },
    @{ Name = 'ninja'; File = 'ninja-win.zip'; Saved = 'ninja-1.13.2-win.zip'; Top = ''
       Url = 'https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip'; Repo = 'ninja-build/ninja'; Tag = 'v1.13.2' },
    @{ Name = 'mingit'; File = 'MinGit-2.56.1-64-bit.zip'; Top = ''
       Url = 'https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/MinGit-2.56.1-64-bit.zip'; Repo = 'git-for-windows/git'; Tag = 'v2.56.1.windows.1' }
)

# ------------------------------------------------------------------ uninstall
if ($Uninstall) {
    Say "Removing $AppName (Windows version)"
    foreach ($p in @($StartMenu, $DesktopLink, $Root)) {
        if (Test-Path $p) { Remove-Item -Recurse -Force $p; Write-Host "removed $p" }
    }
    Write-Host ''
    Write-Host 'Your settings, notes and code are still where they were:'
    Write-Host "  $env:USERPROFILE\.config\cpp-path-workbench   $env:USERPROFILE\.local\share\cpp-path-workbench   $env:USERPROFILE\cpp-path"
    exit 0
}

Write-Host "$AppName for Windows (no WSL)" -ForegroundColor Cyan
Write-Host "Everything goes in $Root; no administrator rights needed."
if ([Environment]::Is64BitOperatingSystem -eq $false -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    Warn 'This needs 64-bit Windows on an Intel or AMD processor (x64). On ARM, use the WSL version.'
}

# ------------------------------------------------------------------ the network
# The proxy Windows uses (Settings -> Network -> Proxy, a PAC script, or
# WinHTTP's). PowerShell's own downloads use it by themselves; Node.js and
# npm are told about it.
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
function ProxyBypass {
    try {
        $o = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction Stop).ProxyOverride
        if (-not $o) { return '' }
        return ((($o -split ';') | Where-Object { $_ -and $_ -ne '<local>' } | ForEach-Object { $_ -replace '^\*', '' }) -join ',')
    } catch { return '' }
}
# The certificates Windows trusts, for Node.js: a proxy that inspects HTTPS
# re-signs sites with the company's root certificate, which Windows has and
# Node.js doesn't.
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

Say 'The network'
New-Item -ItemType Directory -Force -Path $Root, $Tools, $Cache | Out-Null
$ProxyUrl = FindProxy
if ($ProxyUrl) { Write-Host "Company proxy: $($ProxyUrl -replace '//[^@/]*@', '//***@') (-Proxy <url> to choose another, -NoProxy for none)" }
else { Write-Host 'No proxy.' }
$n = ExportWindowsCerts $CertFile
Write-Host "$n certificates Windows trusts, for Node.js: $CertFile"

function Web([string]$url, [string]$outFile) {
    $a = @{ Uri = $url; UseBasicParsing = $true; Headers = @{ 'User-Agent' = 'cpp-path-workbench-installer' } }
    if ($Proxy -and -not $NoProxy) { $a.Proxy = $Proxy; $a.ProxyUseDefaultCredentials = $true }
    if ($outFile) { $a.OutFile = $outFile; Invoke-WebRequest @a | Out-Null; return $null }
    return (Invoke-WebRequest @a).Content
}

# The SHA-256 the project publishes for a download, or '' if it can't be had
function ExpectedHash($pin) {
    try {
        if ($pin.Sums) {
            $sums = Web $pin.Sums
            if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
            foreach ($line in ($sums -split "`n")) {
                if ($line -match ('^([0-9a-f]{64})\s+' + [regex]::Escape($pin.File) + '\s*$')) { return $Matches[1] }
            }
        } elseif ($pin.Repo) {
            $rel = (Web "https://api.github.com/repos/$($pin.Repo)/releases/tags/$($pin.Tag)") | ConvertFrom-Json
            $asset = @($rel.assets | Where-Object { $_.name -eq $pin.File })[0]
            if ($asset -and $asset.digest -match '^sha256:([0-9a-f]{64})$') { return $Matches[1] }
        }
    } catch { Warn "Couldn't look up the checksum for $($pin.File): $($_.Exception.Message)" }
    return ''
}

# ------------------------------------------------------------------ the tools
Say 'The compilers and tools'
$tar = Join-Path $env:WINDIR 'System32\tar.exe'
foreach ($pin in $Pins) {
    $dest = Join-Path $Tools $pin.Name
    $stamp = Join-Path $dest '.cpw-version'
    if ((Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $pin.File)) { Write-Host "ok        $($pin.Name) ($($pin.File))"; continue }
    $saved = if ($pin.Saved) { $pin.Saved } else { $pin.File }
    $file = Join-Path $Cache $saved
    $want = ExpectedHash $pin
    if ((Test-Path $file) -and $want -and ((Get-FileHash -Algorithm SHA256 $file).Hash.ToLower() -ne $want)) { Remove-Item -Force $file }
    if (-not (Test-Path $file)) {
        Write-Host "download  $($pin.File)"
        try { Web $pin.Url "$file.part"; Move-Item -Force "$file.part" $file }
        catch {
            Remove-Item -Force -ErrorAction SilentlyContinue "$file.part"
            Fail ("Couldn't download $($pin.File): $($_.Exception.Message)`n" +
                "If the network blocks it, download it in your browser from`n  $($pin.Url)`n" +
                "save it as $file, and run this again.")
        }
    }
    $got = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower()
    if ($want) {
        if ($got -ne $want) { Remove-Item -Force $file; Fail "$($pin.File) isn't the file its project published (SHA-256 $got, expected $want). It was deleted: run this again." }
        Write-Host "checked   $($pin.File) (SHA-256 matches)"
    } else {
        Warn "$($pin.File): no published checksum could be fetched to compare with (SHA-256 $got). Carrying on."
    }
    Write-Host "unpack    $($pin.Name)"
    $tmp = Join-Path $Tools ".unpack-$($pin.Name)"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    if ($pin.Sfx) {
        # a self-extracting 7-Zip archive: -y (no questions) -o<folder>
        $p = Start-Process -FilePath $file -ArgumentList @('-y', ('-o"' + $tmp + '"')) -Wait -PassThru -WindowStyle Hidden
        if ($p.ExitCode -ne 0) { Fail "Unpacking $($pin.File) failed (exit $($p.ExitCode))." }
    } elseif (Test-Path $tar) {
        & $tar -xf $file -C $tmp
        if ($LASTEXITCODE -ne 0) { Fail "Unpacking $($pin.File) failed (tar exit $LASTEXITCODE)." }
    } else {
        Expand-Archive -Path $file -DestinationPath $tmp -Force
    }
    $inner = if ($pin.Top) { Join-Path $tmp $pin.Top } else { $tmp }
    if (-not (Test-Path $inner)) { Fail "$($pin.File) didn't contain $($pin.Top)." }
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Move-Item $inner $dest
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Set-Content -Encoding ASCII -Path $stamp -Value $pin.File
}

# The tools first on PATH for the rest of this script (the app does the same for itself)
$dirs = @('llvm-mingw\bin', 'llvm-mingw\x86_64-w64-mingw32\bin', 'w64devkit\bin', 'cmake\bin', 'ninja', 'mingit\cmd', 'node') |
    ForEach-Object { Join-Path $Tools $_ } | Where-Object { Test-Path $_ }
$env:Path = (($dirs + @($env:Path)) -join ';')
foreach ($t in @('node', 'clang++', 'gdb', 'cmake', 'ninja', 'git', 'sh')) {
    $c = Get-Command $t -ErrorAction SilentlyContinue
    if ($c) { Write-Host ("found     {0,-8} {1}" -f $t, $c.Source) } else { Warn "$t is missing" }
}
foreach ($t in @('clangd', 'clang-tidy', 'clang-format')) {
    if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Write-Host "($t isn't in this llvm-mingw: the editor works without it, with less help as you type)" }
}

# ------------------------------------------------------------------ the app
Say "The app, into $App"
if (-not (Test-Path (Join-Path $Source 'package.json'))) { Fail "Can't find the app next to this script ($Source)." }
New-Item -ItemType Directory -Force -Path $App | Out-Null
# /MIR: the same files as the download; node_modules and the built page are
# kept (they're made here), and so are your settings, which live elsewhere
& robocopy.exe $Source $App /MIR /XD node_modules .git dist /XF '*.log' /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "Copying the app failed (robocopy exit $LASTEXITCODE)." }
Write-Host "Copied to $App"

Say "The app's packages (Electron, the window, is about 100 MB)"
$env:NODE_EXTRA_CA_CERTS = $CertFile
if ($ProxyUrl) {
    $env:HTTPS_PROXY = $ProxyUrl; $env:HTTP_PROXY = $ProxyUrl
    $env:ELECTRON_GET_USE_PROXY = '1'; $env:GLOBAL_AGENT_HTTPS_PROXY = $ProxyUrl; $env:GLOBAL_AGENT_HTTP_PROXY = $ProxyUrl
    $bypass = ProxyBypass
    if ($bypass) { $env:NO_PROXY = $bypass; $env:GLOBAL_AGENT_NO_PROXY = $bypass }
}
Push-Location $App
try {
    $npm = Join-Path $Tools 'node\npm.cmd'
    & $npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host 'npm install failed. If the messages above mention 407 or "proxy authentication", the proxy wants a login'
        Write-Host 'that Node.js can''t give it: run px (github.com/genotrance/px), which signs in with your Windows account,'
        Write-Host 'then run this again with -Proxy http://localhost:3128.'
        Fail "npm install failed (exit $LASTEXITCODE)."
    }
    if (-not (Test-Path (Join-Path $App 'node_modules\electron\dist\electron.exe'))) {
        & (Join-Path $Tools 'node\node.exe') node_modules\electron\install.js
        if (-not (Test-Path (Join-Path $App 'node_modules\electron\dist\electron.exe'))) { Fail 'Electron (the window) didn''t download. Check the network, then run this again.' }
    }
    & (Join-Path $Tools 'node\node.exe') scripts\build-web.js | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'Building the app''s page failed.' }
} finally { Pop-Location }

# ------------------------------------------------------------------ the shortcuts
Say 'Start menu and desktop'
Copy-Item -Force (Join-Path $PSScriptRoot 'icon.ico') $Root
Copy-Item -Force $PSCommandPath (Join-Path $Root 'Install-Native.ps1')
$shell = New-Object -ComObject WScript.Shell
# The shortcuts start the app's own program (Electron) directly: no script
# in between, since many work laptops block Windows Script Host (.vbs) by
# group policy. The app finds its tools and certificates by itself.
$electron = Join-Path $App 'node_modules\electron\dist\electron.exe'
$appArg = "`"$App`""
$oldVbs = Join-Path $Root 'Launch-Native.vbs'
if (Test-Path $oldVbs) { Remove-Item -Force $oldVbs }
function MakeLink([string]$path, [string]$target, [string]$arguments, [string]$description, [string]$dir = $App) {
    $l = $shell.CreateShortcut($path)
    $l.TargetPath = $target
    $l.Arguments = $arguments
    $l.WorkingDirectory = $dir
    $l.IconLocation = "$(Join-Path $Root 'icon.ico'),0"
    $l.Description = $description
    $l.Save()
}
New-Item -ItemType Directory -Force -Path $StartMenu | Out-Null
MakeLink (Join-Path $StartMenu "$AppName.lnk") $electron $appArg 'C and C++: editor, build, run, debug, tests, sandbox, guides'
MakeLink (Join-Path $StartMenu "Uninstall $AppName.lnk") (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $Root 'Install-Native.ps1')`" -Uninstall" 'Removes the Windows version (your notes and code stay)' $Root
Write-Host "Start menu: $StartMenu"
if (-not $NoDesktop) {
    MakeLink $DesktopLink $electron $appArg 'C and C++: editor, build, run, debug, tests, sandbox, guides'
    Write-Host "Desktop:    $DesktopLink"
}

Write-Host ''
Write-Host "Done. Start $AppName (Windows) from the Start menu or your desktop." -ForegroundColor Cyan
Write-Host 'Your notes vault can stay in Documents or OneDrive: add it in Guides -> Add a vault.'
Write-Host "To update later: download the new version and run 'Install on Windows (no WSL).cmd' again."
if (Ask 'Start it now?') { Start-Process -FilePath $electron -ArgumentList $appArg -WorkingDirectory $App }
