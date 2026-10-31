@echo off
title Legado - Instalador (Glasius.Mods)
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador\legado-installer.ps1"
echo.
pause
