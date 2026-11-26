' MHDE (McFez's HomeBrew Development Environment): starts the app inside WSL without a console window.
' The Start menu and desktop shortcuts run this (wscript.exe Launch.vbs).
' launcher.ini, next to it, says which WSL distro and where the app is;
' Install.ps1 writes it.
'
'   wscript Launch.vbs            the app in its own window (the default)
'   wscript Launch.vbs browser    in your Windows browser instead (only if you want that)
Option Explicit
Dim sh, fso, here, distro, appDir, mode, f, line, parts, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
distro = ""
appDir = ""
mode = "auto"

If fso.FileExists(here & "\launcher.ini") Then
    Set f = fso.OpenTextFile(here & "\launcher.ini", 1)
    Do Until f.AtEndOfStream
        line = Trim(f.ReadLine)
        If InStr(line, "=") > 0 And Left(line, 1) <> ";" Then
            parts = Split(line, "=", 2)
            Select Case LCase(Trim(parts(0)))
                Case "distro": distro = Trim(parts(1))
                Case "appdir": appDir = Trim(parts(1))
                Case "mode": mode = LCase(Trim(parts(1)))
            End Select
        End If
    Loop
    f.Close
End If
If WScript.Arguments.Count > 0 Then mode = LCase(WScript.Arguments(0))
If mode <> "window" And mode <> "browser" Then mode = "auto"

If appDir = "" Then
    MsgBox "MHDE isn't set up yet." & vbCrLf & vbCrLf & _
        "Run 'Install on Windows.cmd' from the app's folder.", vbExclamation, "MHDE"
    WScript.Quit 1
End If

' wsl.exe -d <distro> -e bash -lc "exec bash '<app>/scripts/wsl-launch.sh' <mode>"
' (a login shell, so Node.js from nvm or ~/.profile is on the PATH)
cmd = "wsl.exe"
If distro <> "" Then cmd = cmd & " -d " & distro
cmd = cmd & " -e bash -lc ""exec bash '" & appDir & "/scripts/wsl-launch.sh' " & mode & """"
' 0: no window. The app shows its own; problems come up as a message box.
sh.Run cmd, 0, False
