#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/rutba_deploy.sh"
SESSION_NAME="${RUTBA_DEPLOY_SCREEN_SESSION:-rutba_deploy}"
LOG_FILE="${RUTBA_DEPLOY_SCREEN_LOG:-/var/log/rutba_deploy_screen.log}"
ACTION="${1:-start}"

if ! command -v screen >/dev/null 2>&1; then
  echo "ERROR: screen is not installed. Install it first (e.g., apt install screen)." >&2
  exit 1
fi

if [ ! -f "$DEPLOY_SCRIPT" ]; then
  echo "ERROR: Deploy script not found: $DEPLOY_SCRIPT" >&2
  exit 1
fi

is_running() {
  screen -list | grep -q "[[:space:]]${SESSION_NAME}[[:space:]]"
}

start_session() {
  if is_running; then
    echo "Session '${SESSION_NAME}' is already running."
    echo "Reconnect with: screen -r ${SESSION_NAME}"
    exit 0
  fi

  mkdir -p "$(dirname "$LOG_FILE")"

  # Run deploy in a detached screen session and keep full output in a log file.
  screen -dmS "$SESSION_NAME" bash -lc "cd '$SCRIPT_DIR' && bash '$DEPLOY_SCRIPT' 2>&1 | tee -a '$LOG_FILE'"

  echo "Started deploy in screen session: ${SESSION_NAME}"
  echo "Reconnect with: screen -r ${SESSION_NAME}"
  echo "Log file: ${LOG_FILE}"
}

attach_session() {
  if ! is_running; then
    echo "No running session named '${SESSION_NAME}'."
    exit 1
  fi
  exec screen -r "$SESSION_NAME"
}

status_session() {
  if is_running; then
    echo "RUNNING: ${SESSION_NAME}"
    screen -list | grep "[[:space:]]${SESSION_NAME}[[:space:]]" || true
  else
    echo "NOT RUNNING: ${SESSION_NAME}"
    exit 1
  fi
}

stop_session() {
  if ! is_running; then
    echo "No running session named '${SESSION_NAME}'."
    exit 0
  fi
  screen -S "$SESSION_NAME" -X quit
  echo "Stopped session: ${SESSION_NAME}"
}

case "$ACTION" in
  start)
    start_session
    ;;
  attach)
    attach_session
    ;;
  status)
    status_session
    ;;
  stop)
    stop_session
    ;;
  restart)
    stop_session || true
    start_session
    ;;
  *)
    echo "Usage: $0 [start|attach|status|stop|restart]"
    exit 1
    ;;
esac
