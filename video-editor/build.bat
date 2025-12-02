@echo off
REM Build script for Cursor 2D Video Editor (Windows)
REM Usage: build.bat [win|mac|linux|all]

setlocal

cd /d "%~dp0"

echo ========================================
echo Cursor 2D Video Editor - Build Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH
    exit /b 1
)

echo Node.js version:
node --version
echo npm version:
npm --version
echo.

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install dependencies
        exit /b 1
    )
    echo.
)

REM Determine build target
set TARGET=%1
if "%TARGET%"=="" set TARGET=win

echo Building for target: %TARGET%
echo.

if "%TARGET%"=="win" (
    call npm run build:win
) else if "%TARGET%"=="mac" (
    echo WARNING: Building for macOS on Windows may not work correctly.
    echo Consider using GitHub Actions for cross-platform builds.
    call npm run build:mac
) else if "%TARGET%"=="linux" (
    echo WARNING: Building for Linux on Windows may not work correctly.
    echo Consider using GitHub Actions for cross-platform builds.
    call npm run build:linux
) else if "%TARGET%"=="all" (
    call npm run build:all
) else (
    echo ERROR: Unknown target "%TARGET%"
    echo Usage: build.bat [win^|mac^|linux^|all]
    exit /b 1
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Build failed
    exit /b 1
)

echo.
echo ========================================
echo Build completed successfully!
echo Output files are in the 'release' folder
echo ========================================

dir /b release\*.exe 2>nul
dir /b release\*.dmg 2>nul
dir /b release\*.AppImage 2>nul
dir /b release\*.deb 2>nul

endlocal
