#!/usr/bin/env bash
# Starts the app from Windows: the Start menu / desktop shortcut that
# windows\Install.ps1 makes runs this inside WSL (hidden, no console).
#
#   window   the Electron window, drawn by WSLg (Windows 11, or 10 with the
#            Store version of WSL)
#   browser  the same app in your Windows browser (when there is no WSLg,
#            or you'd rather): the backend runs here, the page there
#   auto     window when WSLg is there, browser otherwise (the default)
#
#   bash scripts/wsl-launch.sh [auto|window|browser] [--check]
# --check only says what it would do. Problems show up in a Windows message
# box and in ~/.local/state/cpp-path-workbench/launch.log.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE=auto CHECK=0
for a in "$@"; do
	case "$a" in
		auto|window|browser) MODE="$a" ;;
		--check) CHECK=1 ;;
		*) echo "Unknown option: $a" >&2; exit 2 ;;
	esac
done
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/cpp-path-workbench"
mkdir -p "$STATE"
LOG="$STATE/launch.log"

# A Windows message box, from inside WSL (or the terminal, outside Windows)
tell() {
	local msg="$1"
	printf '%s\n' "$msg" >>"$LOG"
	if [ $CHECK = 0 ] && command -v powershell.exe >/dev/null 2>&1; then
		# the message goes in through an environment variable: no quoting to get wrong
		CPW_MSG="$msg" WSLENV="${WSLENV:+$WSLENV:}CPW_MSG" powershell.exe -NoProfile -NonInteractive -Command \
			'Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show($env:CPW_MSG, "C++ Path Workbench")' >/dev/null 2>&1 || true
	else
		printf '%s\n' "$msg" >&2
	fi
}

{ echo; echo "=== $(date '+%F %T') mode=$MODE dir=$DIR"; } >>"$LOG"

# The shortcut runs a login shell, so nvm / ~/.profile PATHs are there; a
# conda base environment would put its own old node first.
if [ -n "${CONDA_PREFIX:-}" ] && command -v conda >/dev/null 2>&1; then conda deactivate >/dev/null 2>&1 || true; fi
if ! command -v node >/dev/null 2>&1; then
	tell "Node.js isn't installed in WSL. Run 'Install on Windows' again (it sets everything up)."
	exit 1
fi
if [ ! -d "$DIR/node_modules" ]; then
	tell "The app's packages aren't installed yet in $DIR. Run 'Install on Windows' again."
	exit 1
fi

has_wslg() { [ -n "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ] || [ -e /mnt/wslg/.X11-unix/X0 ]; }
if [ "$MODE" = auto ]; then
	if has_wslg && [ -x "$DIR/node_modules/electron/dist/electron" ]; then MODE=window; else MODE=browser; fi
fi
# WSLg's sockets are there even when this process wasn't told about them
if [ "$MODE" = window ] && [ -z "${DISPLAY:-}" ] && [ -e /mnt/wslg/.X11-unix/X0 ]; then export DISPLAY=:0; fi
if [ "$MODE" = window ] && [ -z "${WAYLAND_DISPLAY:-}" ] && [ -e /mnt/wslg/runtime-dir/wayland-0 ]; then
	export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/mnt/wslg/runtime-dir}"
fi
echo "-> $MODE" >>"$LOG"
if [ $CHECK = 1 ]; then echo "$MODE"; exit 0; fi

cd "$DIR" || exit 1
if [ "$MODE" = window ]; then
	started=$(date +%s)
	npm start >>"$LOG" 2>&1
	code=$?
	# a window that closed within seconds never really opened
	if [ $code -ne 0 ] && [ $(( $(date +%s) - started )) -lt 20 ]; then
		tell "The window couldn't open (exit $code). Starting it in your browser instead.

If this keeps happening: in PowerShell run 'wsl --update', then 'wsl --shutdown'. Details: $LOG"
		MODE=browser
	else
		exit $code
	fi
fi

# Browser mode: the backend here, the page in your Windows browser (WSL
# forwards localhost). It stops when you close WSL or run 'wsl --shutdown'.
URLF="$STATE/url"
rm -f "$URLF"
node scripts/build-web.js >>"$LOG" 2>&1
CPW_URL_FILE="$URLF" node server/index.js --web >>"$LOG" 2>&1 &
pid=$!
for _ in $(seq 1 100); do [ -s "$URLF" ] && break; kill -0 $pid 2>/dev/null || break; sleep 0.1; done
if [ ! -s "$URLF" ]; then
	tell "The app didn't start. Details: $LOG"
	exit 1
fi
url="$(cat "$URLF")"
if command -v wslview >/dev/null 2>&1; then wslview "$url" >>"$LOG" 2>&1
elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url" >>"$LOG" 2>&1 || true
else echo "Open: $url"; fi
wait $pid
