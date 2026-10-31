@echo off
title Legado - Desinstalador (Glasius.Mods)
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador\legado-installer.ps1" -Uninstall
echo.
pause
