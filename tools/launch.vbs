' RunningMate launcher: starts the local server (if needed) and opens the app window.
' The port must stay 8765 - browser data is stored per address.
Option Explicit

Const URL = "http://127.0.0.1:8765/"
Dim sh, fso, root, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

Function ServerUp()
  Dim http
  ServerUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 300, 300, 300, 300
  http.open "GET", URL, False
  http.send
  If Err.Number = 0 Then ServerUp = (http.Status = 200)
  On Error GoTo 0
End Function

If Not ServerUp() Then
  sh.Run "pythonw """ & root & "\tools\server.py""", 0, False
  For i = 1 To 20
    WScript.Sleep 250
    If ServerUp() Then Exit For
  Next
End If

sh.Run "cmd /c start """" msedge --app=" & URL, 0, False
