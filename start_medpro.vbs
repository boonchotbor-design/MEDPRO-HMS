Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\0_Node Hospital"
WshShell.Run "node server.js", 0, false
WScript.Sleep 3000
WshShell.Run "ngrok start node-hospital --config=ngrok.yml", 0, false
