#!/bin/sh
# Puts C++ Path Workbench in your app launcher (GNOME: Activities → type "C++";
# in WSL, WSLg may also add it to the Windows Start menu).
# Run from the project folder:  npm run install-desktop
# It sits happily next to the Kernel Path Workbench: separate name, icon,
# settings folder and window.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
# The launcher doesn't run your shell's start-up files, so a Node.js from
# nvm (or anything else not in /usr/bin) wouldn't be found: remember where
# this one is. Run it again if you change Node versions.
command -v node >/dev/null 2>&1 || { echo "node isn't on your PATH: install Node.js first (README)." >&2; exit 1; }
NODE_BIN="$(dirname "$(command -v node)")"
case "$NODE_BIN" in
	*conda*|*anaconda*) echo "Note: node comes from conda ($NODE_BIN). The launcher will use that one." ;;
esac
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
mkdir -p "$APPS" "$ICONS"
cp "$DIR/build/icon.png" "$ICONS/cpp-path-workbench.png"
cat > "$APPS/cpp-path-workbench.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=C++ Path Workbench
Comment=Editor, CMake, tests, gdb, sandbox, judge, terminal, git and guides for the C++ Path
Exec=sh -c 'cd "$DIR" && PATH="$NODE_BIN:\$PATH" exec npm start'
Icon=cpp-path-workbench
Terminal=false
Categories=Development;IDE;
Keywords=C++;cpp;CMake;IDE;
StartupWMClass=cpp-path-workbench
DESKTOP
update-desktop-database "$APPS" 2>/dev/null || true
echo "Installed: $APPS/cpp-path-workbench.desktop"
