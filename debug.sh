#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PID_FILE="$ROOT_DIR/.debug-backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.debug-frontend.pid"
BACKEND_PORT=8866

stop_process() {
  local pid_file="$1"
  local name="$2"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "Stopped $name (PID $pid)"
    fi
    rm -f "$pid_file"
  fi
  # fallback: kill by port
  if [[ "$name" == "backend" ]]; then
    lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null || true
  fi
}

cmd_stop() {
  stop_process "$BACKEND_PID_FILE" "backend"
  stop_process "$FRONTEND_PID_FILE" "frontend"
  echo "All services stopped."
}

cmd_start() {
  # backend
  if [[ -f "$BACKEND_PID_FILE" ]] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
    echo "Backend already running (PID $(cat "$BACKEND_PID_FILE"))"
  else
    nohup node src/server.js > .debug-backend.log 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    echo "Backend started on :$BACKEND_PORT (PID $!)"
  fi

  # frontend
  if [[ -f "$FRONTEND_PID_FILE" ]] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
    echo "Frontend already running (PID $(cat "$FRONTEND_PID_FILE"))"
  else
    nohup npx vite --host > .debug-frontend.log 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    echo "Frontend Vite started (PID $!)"
  fi

  # wait for vite to print the URL
  sleep 2
  grep -o 'http://localhost:[0-9]*' .debug-frontend.log 2>/dev/null | head -1 || true
}

cmd_restart() {
  cmd_stop
  echo "Building frontend..."
  npx vite build
  cmd_start
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  *)
    echo "Usage: $0 {start|stop|restart}"
    echo "  start   - Start backend + Vite dev server"
    echo "  stop    - Stop all services"
    echo "  restart - Rebuild frontend, then start all services"
    exit 1
    ;;
esac
