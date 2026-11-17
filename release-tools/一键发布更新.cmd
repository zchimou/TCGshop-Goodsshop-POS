@echo off
chcp 65001 >nul
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-update.ps1"
