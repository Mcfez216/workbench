#!/usr/bin/env bash
# Starts the app from Windows: the Start menu / desktop shortcut that
# windows\Install.ps1 makes runs this inside WSL (hidden, no console).
#
#   window   the app in its own window, drawn by WSLg (Windows 11, or 10
#            with the Store version of WSL). The default ("auto" means this
#            too). If it can't open, a message says why and how to fix it.
#   browser  the same app in your Windows browser, only if you ask for it:
#            the backend runs here, the page there
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
# behind a company proxy: what the setup saved (Electron's fetch, git, npm)
PROXY_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/cpp-path-workbench/proxy.env"
# shellcheck disable=SC1090
[ -f "$PROXY_ENV" ] && . "$PROXY_ENV"

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
ELECTRON="$DIR/node_modules/electron/dist/electron"
# The app is a desktop program: it opens in its own window. The browser is
# only used when you ask for it (the "browser" mode), never as a surprise.
[ "$MODE" = auto ] && MODE=window

# What stops the window from opening, in plain words, with the fix
window_problems() {
	if ! has_wslg; then
		echo "WSLg isn't running: it's the part of WSL that shows Linux windows on your Windows desktop.
Fix: in PowerShell run   wsl --update   then   wsl --shutdown   and start the app again.
WSLg needs Windows 11, or Windows 10 22H2 (build 19045 or later) with the current WSL from the Microsoft Store."
	fi
	if [ ! -x "$ELECTRON" ]; then
		echo "Electron (the program that draws the app's window) isn't installed, and downloading it didn't work.
Fix: check the internet connection, then run 'Install on Windows' again, or in Ubuntu:   cd $DIR && node node_modules/electron/install.js"
	elif command -v ldd >/dev/null 2>&1; then
		local missing
		missing="$(ldd "$ELECTRON" 2>/dev/null | awk '/not found/ {print $1}' | tr '\n' ' ')"
		[ -n "$missing" ] && echo "Electron is missing some Linux libraries: $missing
Fix: in Ubuntu run   bash $DIR/scripts/setup-ubuntu.sh   (or run 'Install on Windows' again)."
	fi
}

# WSLg's sockets are there even when this process wasn't told about them
if [ "$MODE" = window ] && [ -z "${DISPLAY:-}" ] && [ -e /mnt/wslg/.X11-unix/X0 ]; then export DISPLAY=:0; fi
if [ "$MODE" = window ] && [ -z "${WAYLAND_DISPLAY:-}" ] && [ -e /mnt/wslg/runtime-dir/wayland-0 ]; then
	export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/mnt/wslg/runtime-dir}"
fi
# Electron fetches its program on first use: if setup didn't (an older
# install), fetch it now rather than calling it missing
if [ "$MODE" = window ] && [ $CHECK = 0 ] && [ ! -x "$ELECTRON" ] && [ -f "$DIR/node_modules/electron/install.js" ]; then
	echo "fetching Electron..." >>"$LOG"
	(cd "$DIR" && node node_modules/electron/install.js) >>"$LOG" 2>&1 || true
fi
problems=""
[ "$MODE" = window ] && problems="$(window_problems)"
echo "-> $MODE${problems:+ (blocked: see below)}" >>"$LOG"
if [ $CHECK = 1 ]; then
	echo "$MODE"
	[ -n "$problems" ] && printf '%s\n' "$problems"
	[ -n "$problems" ] && exit 1
	exit 0
fi
if [ -n "$problems" ]; then
	tell "C++ Path Workbench can't open its window yet.

$problems

Details: $LOG (in Ubuntu)"
	exit 1
fi

cd "$DIR" || exit 1
if [ "$MODE" = window ]; then
	started=$(date +%s)
	mark=$(wc -l <"$LOG")
	npm start >>"$LOG" 2>&1
	code=$?
	# a window that closed within seconds never really opened: say why, don't hide it
	if [ $code -ne 0 ] && [ $(( $(date +%s) - started )) -lt 30 ]; then
		said="$(tail -n +"$((mark + 1))" "$LOG" | grep -vE '^\s*$|^>|^npm (ERR|error|notice)|^\s+at |^\s+web/dist/|Done in [0-9]' | tail -n 12)"
		hint=""
		case "$said" in
			*"SUID sandbox"*|*"sandbox"*"namespace"*) hint="Electron's sandbox can't start here. Fix: in Ubuntu run   bash $DIR/scripts/setup-ubuntu.sh" ;;
			*"Missing X server"*|*"cannot open display"*|*"Failed to connect to Wayland"*) hint="WSLg isn't answering. Fix: in PowerShell run   wsl --shutdown   and start the app again (or wsl --update first)." ;;
			*"error while loading shared libraries"*) hint="A Linux library is missing. Fix: in Ubuntu run   bash $DIR/scripts/setup-ubuntu.sh" ;;
			*"too old"*|*"Node.js"*) hint="Node.js is too old. Fix: run 'Install on Windows' again." ;;
		esac
		tell "The window closed straight away (exit $code).
${hint:+
$hint
}
What it said:
$said

All of it: $LOG (in Ubuntu)"
	fi
	exit $code
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
