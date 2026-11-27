#!/usr/bin/env bash
# MHDE (McFez's HomeBrew Development Environment): everything it needs on Ubuntu (24.04; 22.04 should work), either
# a normal install or Ubuntu in WSL on Windows.
#
#   bash scripts/setup-ubuntu.sh               packages; says what to do about Node.js
#   bash scripts/setup-ubuntu.sh --with-node   also installs Node.js 22 from NodeSource
#   bash scripts/setup-ubuntu.sh --with-rust   also installs Rust with rustup (rustc, cargo,
#                                              rust-analyzer, clippy, rustfmt) for your user
#   bash scripts/setup-ubuntu.sh --with-dos    also DOSBox-X (note 0.4; Open Watcom is
#                                              the vault's scripts/install-open-watcom.sh)
#   bash scripts/setup-ubuntu.sh --dry-run     shows what apt would do, changes nothing
#
# READ IT FIRST: it runs sudo apt-get. Everything comes from Ubuntu's own
# archive, except Node.js with --with-node (NodeSource's apt repository) and
# Rust with --with-rust (rustup, from static.rust-lang.org, into ~/.cargo).
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP=cpp-path-workbench
WITH_NODE=0 WITH_DOS=0 WITH_RUST=0 DRY=0
for a in "$@"; do
	case "$a" in
		--with-node) WITH_NODE=1 ;;
		--with-rust) WITH_RUST=1 ;;
		--with-dos) WITH_DOS=1 ;;
		--dry-run) DRY=1 ;;
		-h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
		*) echo "Unknown option: $a" >&2; exit 2 ;;
	esac
done

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!! %s\033[0m\n' "$*"; }

if ! grep -qiE '^ID(_LIKE)?=.*(ubuntu|debian)' /etc/os-release; then
	echo "This script is for Ubuntu (or Debian). On Fedora, see README.md." >&2
	exit 1
fi
. /etc/os-release
WSL=0
if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then WSL=1; fi
echo "$PRETTY_NAME$([ $WSL = 1 ] && echo ', in WSL')"

# Ubuntu 24.04 renamed some libraries (the "t64" transition); pick whichever
# name this release has.
pick() { if apt-cache show "${1}t64" >/dev/null 2>&1; then echo "${1}t64"; else echo "$1"; fi; }

packages=(
	# --- the C++ toolchain the app drives ---
	g++ gcc make cmake ninja-build gdb binutils
	clang clangd clang-tidy clang-format	# clangd: completion and errors as you type
	cppcheck valgrind git ripgrep python3
	libclang-rt-dev				# clang's fuzzing (libFuzzer) and sanitizer libraries
	libc++-dev libc++abi-dev		# libc++, with the std module: import std; (C++23) with clang++

	# --- the app itself: passwords in a keyring, the bin, man pages, links ---
	libsecret-tools gnome-keyring dbus-x11	# secret-tool and a keyring to keep the passwords in
	libglib2.0-bin				# gio: "Move to bin" in the Files sidebar
	man-db manpages-dev
	ca-certificates curl xdg-utils fonts-dejavu-core

	# --- what the Electron window needs (a minimal Ubuntu or WSL lacks some) ---
	libnss3 libnspr4 libgbm1 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1
	libxrandr2 libxfixes3 libpango-1.0-0 libcairo2 libx11-xcb1
	"$(pick libgtk-3-0)" "$(pick libasound2)" "$(pick libcups2)"
	"$(pick libatk-bridge2.0-0)" "$(pick libatk1.0-0)" "$(pick libatspi2.0-0)"
)
[ $WSL = 1 ] && packages+=(wslu)		# wslview: links open in your Windows browser
[ $WITH_DOS = 1 ] && packages+=(dosbox-x)

say "Installing ${#packages[@]} packages"
if [ $DRY = 1 ]; then
	sudo apt-get install -s "${packages[@]}" | grep -E '^(Inst|E:)' || true
else
	sudo apt-get update
	sudo apt-get install -y "${packages[@]}"
fi

# --- Node.js: Electron needs 22.12 or newer; Ubuntu's nodejs is older ---
node_ok() {
	command -v node >/dev/null 2>&1 || return 1
	node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'
}
say "Node.js"
if node_ok; then
	echo "OK: node $(node --version) at $(command -v node)"
elif [ $WITH_NODE = 1 ] && [ $DRY = 0 ]; then
	tmp="$(mktemp)"
	curl -fsSL https://deb.nodesource.com/setup_22.x -o "$tmp"
	# Ubuntu's own npm package clashes with NodeSource's nodejs (which has npm in it)
	if dpkg -s npm >/dev/null 2>&1; then sudo apt-get remove -y npm; fi
	sudo -E bash "$tmp"
	rm -f "$tmp"
	sudo apt-get install -y nodejs
	hash -r
	node_ok && echo "OK: node $(node --version)" || warn "node is still too old: is another one earlier on your PATH? ($(command -v node))"
else
	warn "Node.js 22.12 or newer is needed (found: $(command -v node >/dev/null && node --version || echo none))."
	echo "    Run this script again with --with-node, or by hand:"
	echo "      curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh"
	echo "      sudo -E bash nodesource_setup.sh && sudo apt-get install -y nodejs"
fi
if [ -n "${CONDA_PREFIX:-}" ]; then
	case "$(command -v node 2>/dev/null) $(command -v python3)" in
		*"$CONDA_PREFIX"*) warn "conda's environment is active and its node or python3 comes first on your PATH."
			echo "    Run 'conda deactivate' before npm install / npm start (or: conda config --set auto_activate_base false)." ;;
	esac
fi

# --- Electron's sandbox on Ubuntu 24.04+ (not WSL) ---
# Ubuntu stops programs from making user namespaces unless AppArmor allows
# them, and Chromium's sandbox needs one. This gives the app's own Electron
# that permission, nothing else (the same kind of profile Ubuntu ships for
# Chrome and VS Code).
if [ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] && [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)" = 1 ]; then
	say "AppArmor: let this app's Electron use its sandbox"
	ELECTRON="$DIR/node_modules/electron/dist/electron"
	if [ ! -x "$ELECTRON" ]; then
		echo "Run 'npm install' first, then this script again (it needs Electron's path)."
	elif [ $DRY = 1 ]; then
		echo "Would write /etc/apparmor.d/$APP for $ELECTRON"
	else
		sudo tee "/etc/apparmor.d/$APP" >/dev/null <<-PROFILE
		abi <abi/4.0>,
		include <tunables/global>

		profile $APP "$ELECTRON" flags=(unconfined) {
		  userns,
		  include if exists <local/$APP>
		}
		PROFILE
		sudo apparmor_parser -r "/etc/apparmor.d/$APP"
		echo "Done. If you move the app's folder, run this script again."
	fi
fi

# --- WSL ---
if [ $WSL = 1 ]; then
	say "WSL checks"
	if [ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]; then
		warn "No WSLg display. The app's window needs WSLg: in PowerShell run 'wsl --update', then 'wsl --shutdown'."
		echo "    Or use 'npm run web' and open the address it prints in your Windows browser."
	else
		echo "OK: WSLg display (${WAYLAND_DISPLAY:-}${WAYLAND_DISPLAY:+ / }${DISPLAY:-})"
	fi
	case "$DIR" in
		/mnt/*) warn "The app is on the Windows drive ($DIR). Builds and file watching are much faster in your Linux home: move it to ~/." ;;
	esac
	echo "Passwords: the first time the app stores one, a window should ask you to choose a"
	echo "password for a new keyring. After each WSL restart it may ask for it again."
fi

# --- Rust: rustup, for your own user (no sudo). Ubuntu's own rustc is too old
# for the 2024 edition the Rust vault uses.
if [ $WITH_RUST = 1 ]; then
	say "Rust (rustup: rustc, cargo, rust-analyzer, clippy, rustfmt)"
	[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
	if command -v rustup >/dev/null 2>&1; then
		echo "rustup is already here: updating"
		[ $DRY = 1 ] || { rustup update stable && rustup component add rust-analyzer clippy rustfmt; }
	elif [ $DRY = 1 ]; then
		echo "Would download https://sh.rustup.rs and run it with -y --profile default --component rust-analyzer"
	else
		tmp="$(mktemp)"
		curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$tmp"
		sh "$tmp" -y --profile default --component rust-analyzer
		rm -f "$tmp"
		. "$HOME/.cargo/env"
	fi
	command -v rustc >/dev/null 2>&1 && echo "OK: $(rustc --version)" || warn "Rust didn't install: see above."
fi

say "Next"
cat <<EOF
  cd "$DIR"
  npm install                 # downloads Electron (about 100 MB)
  npm start
  npm run install-desktop     # optional: a launcher$([ $WSL = 1 ] && echo ' (WSLg may also list it in the Windows Start menu)')
EOF
