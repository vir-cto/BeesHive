@echo off
title Bee's Hive Print Relay
cd /d "%~dp0"
echo ============================================
echo  Bee's Hive - PT-210 Print Relay
echo ============================================
rem Load printer names from .env.print-relay if present (KEY=VALUE lines).
if exist .env.print-relay for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env.print-relay") do set "%%a=%%b"
rem Resolve each role's transport the same way scripts\print-server.cjs does:
rem   explicit *_PRINTER_TRANSPORT wins, else *_PRINTER_NAME = windows-spooler,
rem   else *_BLUETOOTH_PORT = bluetooth, else legacy host:port = tcp.
set "KITCHEN_TRANSPORT=%KITCHEN_PRINTER_TRANSPORT%"
if "%KITCHEN_TRANSPORT%"=="" if not "%KITCHEN_PRINTER_NAME%"=="" set "KITCHEN_TRANSPORT=windows-spooler"
if "%KITCHEN_TRANSPORT%"=="" if not "%KITCHEN_BLUETOOTH_PORT%"=="" set "KITCHEN_TRANSPORT=bluetooth"
set "ADMIN_TRANSPORT=%ADMIN_PRINTER_TRANSPORT%"
if "%ADMIN_TRANSPORT%"=="" if not "%ADMIN_PRINTER_NAME%"=="" set "ADMIN_TRANSPORT=windows-spooler"
if "%ADMIN_TRANSPORT%"=="" if not "%ADMIN_BLUETOOTH_PORT%"=="" set "ADMIN_TRANSPORT=bluetooth"
if "%KITCHEN_TRANSPORT%"=="" echo [WARN] Kitchen printer not configured - kitchen jobs will FAIL - see docs\pt210-deployment.md
if /I "%KITCHEN_TRANSPORT%"=="bluetooth" if "%KITCHEN_BLUETOOTH_PORT%"=="" echo [WARN] Kitchen Bluetooth selected but KITCHEN_BLUETOOTH_PORT is not set - kitchen jobs will FAIL
if "%ADMIN_TRANSPORT%"=="" echo [WARN] Admin printer not configured - admin jobs will FAIL - see docs\pt210-deployment.md
if /I "%ADMIN_TRANSPORT%"=="bluetooth" if "%ADMIN_BLUETOOTH_PORT%"=="" echo [WARN] Admin Bluetooth selected but ADMIN_BLUETOOTH_PORT is not set - admin jobs will FAIL
echo Kitchen printer: "%KITCHEN_PRINTER_NAME%"  transport=%KITCHEN_TRANSPORT% %KITCHEN_BLUETOOTH_PORT%
echo Admin printer : "%ADMIN_PRINTER_NAME%"  transport=%ADMIN_TRANSPORT% %ADMIN_BLUETOOTH_PORT%
echo.
node scripts\print-server.cjs
echo.
echo Relay stopped. Press any key to close this window.
pause >nul
