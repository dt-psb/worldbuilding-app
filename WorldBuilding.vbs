Option Explicit
Dim WshShell, fso, currentDir
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir
WshShell.Run """" & currentDir & "\WorldBuilding.exe""", 0, False
