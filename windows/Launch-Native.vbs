' Starts C++ Path Workbench, the Windows version (no WSL), with no console
' window. Install-Native.ps1 puts this in %LOCALAPPDATA%\CppPathWorkbenchNative
' next to the app and its tools.
Option Explicit
Dim sh, fso, env, root, electron, certs
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
electron = root & "\app\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
  MsgBox "C++ Path Workbench isn't fully installed (no " & electron & ")." & vbCrLf & vbCrLf & _
    "Run 'Install on Windows (no WSL).cmd' again.", vbExclamation, "C++ Path Workbench"
  WScript.Quit 1
End If
Set env = sh.Environment("Process")
' where the compilers are (the app puts them first on its PATH)
env("CPW_TOOLS") = root & "\tools"
' the certificates Windows trusts, for the app's own connections (mail, IRC)
' behind a proxy that inspects HTTPS
certs = root & "\windows-roots.pem"
If fso.FileExists(certs) Then env("NODE_EXTRA_CA_CERTS") = certs
sh.CurrentDirectory = root & "\app"
sh.Run """" & electron & """ """ & root & "\app""", 1, False
