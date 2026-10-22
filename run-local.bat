@echo off
cd /d "%~dp0"
title SkillSwap

rem Runs SkillSwap without Docker (SQLite) and opens it in Brave or the default browser.
rem The venv lives outside the project so the project folder stays clean.
set "VENV=%USERPROFILE%\.venvs\skillswap"

if not exist "%VENV%\Scripts\python.exe" (
  echo Creating virtual environment...
  py -m venv "%VENV%" 2>nul || python -m venv "%VENV%"
)
if not exist "%VENV%\Scripts\python.exe" (
  echo Python not found. Install it from https://www.python.org/downloads/ and run again.
  pause
  exit /b 1
)

echo Installing dependencies...
"%VENV%\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements-local.txt || (pause & exit /b 1)

"%VENV%\Scripts\python.exe" run_local.py
pause
