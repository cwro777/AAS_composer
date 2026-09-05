@echo off
rem ---------------------------------------------------------------
rem  Short wrapper for dev-up.ps1
rem
rem    scripts\aas            Composer only  (web 3000 / api 8787 / db 5433)
rem    scripts\aas full       + BaSyx 8081 / MQTT 1883
rem    scripts\aas clean      wipe .next first
rem    scripts\aas restart    kill and respawn what is already up
rem
rem  Flags combine:  scripts\aas full restart
rem
rem  ASCII only on purpose. cmd.exe reads batch files in the OEM code page,
rem  so UTF-8 Korean here desynchronizes the parser and every later line
rem  is executed as garbage. The Korean explanation lives in dev-up.ps1.
rem ---------------------------------------------------------------
setlocal

rem Capture our own directory BEFORE parsing. `shift` moves %0 as well,
rem so %~dp0 stops pointing at this file once any argument is consumed.
set "HERE=%~dp0"
set "ARGS="

:parse
if "%~1"=="" goto run

if /I "%~1"=="full" (
  set "ARGS=%ARGS% -Full"
  shift
  goto parse
)
if /I "%~1"=="clean" (
  set "ARGS=%ARGS% -Clean"
  shift
  goto parse
)
if /I "%~1"=="restart" (
  set "ARGS=%ARGS% -Restart"
  shift
  goto parse
)
if /I "%~1"=="help" goto usage
if /I "%~1"=="-h" goto usage
if /I "%~1"=="/?" goto usage

echo Unknown argument: %~1
echo.
goto usage

:usage
echo Usage: aas [full] [clean] [restart]
echo.
echo   (none)    Composer only - web 3000 / api 8787 / postgres 5433
echo   full      also BaSyx 8081 / MQTT 1883
echo   clean     wipe apps\web\.next before starting
echo   restart   kill what is running and start again
exit /b 2

:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%dev-up.ps1"%ARGS%
exit /b %ERRORLEVEL%
