@echo off
REM Rutba dev environment — one window, apps compiled on demand.
REM
REM   dev                  backend + auth now, the other 20 apps on first request
REM   dev pos crm          only these apps
REM   dev --cat sales      every app in a category
REM   dev --all            all 22 eagerly (needs ~15 GB; rarely what you want)
REM   dev --help           full flag list
REM
REM Deliberately a .cmd and not a .ps1: this is a single passthrough line, and
REM PowerShell spends several hundred ms loading its profile before running it.
REM The 24-window problem was never the shell — see scripts/js/dev.js.
cd /d "%~dp0"
node scripts/js/dev.js %*
