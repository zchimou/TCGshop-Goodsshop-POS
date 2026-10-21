@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-domain.ps1"
pause
