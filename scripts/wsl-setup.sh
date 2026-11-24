#!/usr/bin/env bash
# The WSL half of "Install on Windows": windows\Install.ps1 copies the app
# into your Linux home and runs this there. You can also run it yourself in
# Ubuntu (WSL) to repair or update an install:
#
#   bash scripts/wsl-setup.sh            packages, Node.js, npm install, build
#   bash scripts/wsl-setup.sh --quick    just npm install and build (packages are there)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
QUICK=0
for a in "$@"; do
	case "$a" in
		--quick) QUICK=1 ;;
		*) echo "Unknown option: $a" >&2; exit 2 ;;
	esac
done
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

cd "$DIR"
# A copy made on Windows can come with Windows line endings, which bash and
# python can't run: put the scripts back to Unix ones.
find scripts server -type f \( -name '*.sh' -o -name '*.py' \) -exec sed -i 's/\r$//' {} +
chmod +x scripts/*.sh

if [ $QUICK = 0 ]; then
	say "Ubuntu packages and Node.js (sudo asks for your Linux password)"
	bash scripts/setup-ubuntu.sh --with-node
	hash -r
fi

say "The app's packages (Electron is about 100 MB)"
npm install --no-audit --no-fund
node scripts/build-web.js

say "Done"
echo "Start it from the Windows Start menu or desktop: C++ Path Workbench."
echo "Or here: cd \"$DIR\" && npm start   (npm run web: the same app in your browser)"
