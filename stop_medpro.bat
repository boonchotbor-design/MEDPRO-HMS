@echo off
echo Stopping MEDPRO Node.js Server and Ngrok...
taskkill /f /im node.exe
taskkill /f /im ngrok.exe
echo Done!
pause
