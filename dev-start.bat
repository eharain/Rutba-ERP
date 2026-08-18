@echo off
REM ─────────────────────────────────────────────────────────────────────────
REM  SUPERSEDED — this script now delegates to dev.cmd
REM
REM  It used to open 24 `cmd /k` windows and start all 22 Next.js apps at once
REM  (~110 processes, ~15 GB). `dev` runs one window and compiles an app only
REM  when you actually open it. See scripts/js/dev-gateway.js.
REM
REM    dev              backend + auth now, the rest on demand   <- start here
REM    dev pos crm      just these apps
REM    dev --all        the old all-22 behaviour, if you truly want it
REM
REM  The one argument this script used to take is still honoured:
REM    dev-start.bat core   ->   dev --core
REM ─────────────────────────────────────────────────────────────────────────
cd /d "%~dp0"
if /i "%~1"=="core" (
  call dev.cmd --core
) else (
  call dev.cmd %*
)
