@echo off
REM SUPERSEDED — dev-2.bat was the three-window variant of dev-start.bat.
REM Both are now the same thing: one window, apps on demand. See dev.cmd.
cd /d "%~dp0"
call dev.cmd %*
