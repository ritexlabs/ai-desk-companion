@echo off
REM Robo Wake-Up — Windows launcher
REM Double-click in Explorer, or run from Command Prompt / PowerShell

cd /d "%~dp0"

where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    python start.py %*
) else (
    where py >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        py start.py %*
    ) else (
        echo.
        echo  [ERROR] Python was not found in PATH.
        echo  Install Python 3.10+ from https://python.org/downloads
        echo  and make sure to check "Add Python to PATH" during install.
        echo.
        pause
        exit /b 1
    )
)
