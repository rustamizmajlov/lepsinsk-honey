@echo off
cd /d "%~dp0"
title Lepsinsk Honey

rem Starts the shop without Docker: the C++ server on SQLite also serves the web pages.
rem The first run compiles the server with MinGW g++ (several minutes). Delete backend\build to rebuild.
set "EXE=backend\build\honey-server.exe"

if not exist "%EXE%" (
  where g++ >nul 2>nul || (
    echo g++ not found. Install MinGW-w64 from https://winlibs.com and add its bin folder to PATH.
    pause
    exit /b 1
  )
  if not exist backend\build mkdir backend\build
  echo [1/2] Compiling SQLite...
  gcc -O2 -c backend\third_party\sqlite3.c -o backend\build\sqlite3.o || goto fail
  echo [2/2] Compiling the C++ server, this takes a few minutes...
  g++ -std=c++17 -O2 -DUSE_SQLITE -Ibackend\third_party backend\src\*.cpp backend\build\sqlite3.o -o "%EXE%" -static -lws2_32 || goto fail
)

set "DB_PATH=%~dp0honey.db"
set "STATIC_DIR=%~dp0frontend\public"
set "HOST=127.0.0.1"
set "PORT=8080"

rem Open Brave (or the default browser) two seconds after the server starts
set "BRAVE=%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
if not exist "%BRAVE%" set "BRAVE=%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; if (Test-Path '%BRAVE%') { Start-Process '%BRAVE%' 'http://localhost:8080' } else { Start-Process 'http://localhost:8080' }"

"%EXE%"
pause
exit /b 0

:fail
echo Build failed.
pause
exit /b 1
