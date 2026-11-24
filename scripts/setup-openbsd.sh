#!/bin/sh
# C++ Path Workbench on OpenBSD (7.7 or newer, amd64 or arm64): the packages,
# the app's own npm packages, and a launcher in your desktop's menu.
#
#   sh scripts/setup-openbsd.sh            install everything (asks doas for packages)
#   sh scripts/setup-openbsd.sh --dry-run  show what it would install, change nothing
#
# READ IT FIRST: it runs doas pkg_add. Everything comes from OpenBSD's own
# packages. doas needs a line in /etc/doas.conf, e.g.  permit persist :wheel
#
# How it differs from Linux, so nothing surprises you:
#   - the compiler is clang (part of OpenBSD): cc / c++ / clang / clang++
#   - gdb is a package and installs as egdb; the app finds it
#   - there's no AddressSanitizer on OpenBSD. "Sanitizers on" means UBSan in
#     trap mode (undefined behaviour stops the program with "Illegal
#     instruction") plus OpenBSD's own strict malloc (MALLOC_OPTIONS=S),
#     which catches double frees, many use-after-frees and overflows
#   - no Electron: the window is Chromium in app mode (no tabs, no address bar)
#   - no libFuzzer; Valgrind is amd64 only
set -eu

DIR="$(cd "$(dirname "$0")/.." && pwd)"
DRY=0
for a in "$@"; do
	case "$a" in
		--dry-run) DRY=1 ;;
		-h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) echo "Unknown option: $a" >&2; exit 2 ;;
	esac
done
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!! %s\033[0m\n' "$*"; }

if [ "$(uname -s)" != OpenBSD ]; then
	echo "This script is for OpenBSD (this is $(uname -s))." >&2
	exit 1
fi
echo "OpenBSD $(uname -r) on $(uname -m)"

# Required: the app can't start or build without these
NEED="node git cmake ninja gdb python%3 chromium"
# Wanted: the app works without them, with that feature switched off
WANT="clang-tools-extra cppcheck ripgrep"
[ "$(uname -m)" = amd64 ] && WANT="$WANT valgrind"

say "Packages: $NEED (and if they're there: $WANT)"
if [ $DRY = 1 ]; then
	echo "doas pkg_add $NEED"
	for p in $WANT; do echo "doas pkg_add $p"; done
	echo "npm install && node scripts/build-web.js"
	echo "a launcher in ~/.local/share/applications"
	exit 0
fi
command -v doas >/dev/null 2>&1 || { echo "doas isn't set up: see doas.conf(5)." >&2; exit 1; }
# -I: no questions; pkg_add picks the flavour (python%3 is the current Python 3)
doas pkg_add -I $NEED
for p in $WANT; do doas pkg_add -I "$p" || warn "$p didn't install; the app works without it"; done

say "Node.js"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a < 22 || (a === 22 && b < 12)) { console.error("Node.js " + process.version + " is too old: this needs 22.12 or newer (OpenBSD 7.7 and later have it)"); process.exit(1); }'
node --version

say "The app's packages"
cd "$DIR"
npm install --no-audit --no-fund
node scripts/build-web.js

say "Checking the tools"
for t in c++ cc egdb cmake ninja clangd clang-tidy cppcheck python3 chrome; do
	if command -v "$t" >/dev/null 2>&1; then printf '  ok       %s\n' "$t"; else printf '  missing  %s\n' "$t"; fi
done
node scripts/app-window.js --check || true

say "A launcher in your desktop's menu"
sh scripts/install-desktop.sh || warn "No launcher made; start it with: cd $DIR && npm start"

say "Done"
echo "Start it from your desktop's menu (C++ Path Workbench), or:  cd \"$DIR\" && npm start"
