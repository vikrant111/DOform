@echo off
REM CVP Requisition - double-click to start on Windows (development copy).
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist ".env" (
  echo First run: creating .env from .env.example
  copy ".env.example" ".env" >nul
)

if not exist "node_modules" (
  echo First run: installing dependencies, this takes a minute...
  call npm install || (pause & exit /b 1)
)

call npm start
if errorlevel 1 pause
