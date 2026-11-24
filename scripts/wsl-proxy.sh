#!/usr/bin/env bash
# Behind a company proxy: makes apt, curl, npm, git and Electron's download
# go through it, and trusts the company's HTTPS-inspection certificate if
# the proxy re-signs HTTPS (the usual cause of "certificate verify failed").
# Sourced by wsl-setup.sh, so what it exports carries on into the setup.
#
#   CPW_PROXY          http://proxy.example.com:8080 (from Windows, or by hand);
#                      empty or unset: no proxy, only the certificate check
#   CPW_NO_PROXY       hosts to reach directly (default: localhost and Windows' own list)
#   CPW_WINDOWS_CERTS  a PEM file of the certificates Windows trusts
#                      (Install.ps1 exports them); used only if HTTPS fails without them
#   CPW_SUDO           what to run root steps with (default sudo; tests use a stand-in)
#   CPW_ROOT           a folder standing in for / (tests only)
#
# What it writes (and so what to delete to undo it):
#   /etc/apt/apt.conf.d/95cpp-path-workbench-proxy
#   /usr/local/share/ca-certificates/cpp-path-workbench/  (then update-ca-certificates)
#   ~/.config/cpp-path-workbench/proxy.env, read by ~/.profile and the app's launcher
#   npm's and git's proxy settings (npm config / git config --global)

CPW_SUDO="${CPW_SUDO:-sudo}"
CPW_ROOT="${CPW_ROOT:-}"
CPW_PROXY_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/cpp-path-workbench/proxy.env"
CPW_TEST_URL="${CPW_TEST_URL:-https://registry.npmjs.org/}"
proxy_say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
proxy_warn() { printf '\033[1;33m!!! %s\033[0m\n' "$*"; }

# WSL 2 normally has its own network (NAT): "localhost" there is Linux, not
# Windows. A proxy on Windows' localhost (px, cntlm, a security client) is
# reached through the Windows host's address instead, unless WSL mirrors
# Windows' network (networkingMode=mirrored), where localhost is shared.
proxy_fix_localhost() {
	local url="$1" mode="" gw=""
	case "$url" in *://localhost:*|*://localhost/*|*://localhost|*://127.0.0.1:*|*://127.0.0.1/*|*://127.0.0.1|*://\[::1\]*) ;; *) printf '%s' "$url"; return ;; esac
	command -v wslinfo >/dev/null 2>&1 && mode="$(wslinfo --networking-mode 2>/dev/null)"
	if [ "$mode" = mirrored ] || [ -n "${CPW_MIRRORED:-}" ]; then printf '%s' "$url"; return; fi
	gw="${CPW_WINDOWS_HOST:-$(ip route show default 2>/dev/null | awk '/default/ {print $3; exit}')}"
	if [ -z "$gw" ]; then printf '%s' "$url"; return; fi
	printf '%s' "$url" | sed -E "s#://(localhost|127\.0\.0\.1|\[::1\])#://$gw#"
}

# 0: works. 60/35: TLS (an inspecting proxy). 22 + 407 in the text: the
# proxy wants a login. Anything else: the network.
proxy_check() {
	local out code
	out="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$CPW_TEST_URL" 2>&1)"; code=$?
	CPW_CHECK_SAID="$out"
	case "$out" in *407*) return 47 ;; esac
	return $code
}

# Windows' trusted certificates, one per file, where update-ca-certificates
# looks. Only ones that are valid PEM certificates go in.
proxy_trust_windows() {
	local src="$1" tmp n=0
	[ -s "$src" ] || return 1
	tmp="$(mktemp -d)"
	awk -v dir="$tmp" '/-----BEGIN CERTIFICATE-----/ { n++; f = sprintf("%s/windows-%03d.crt", dir, n) } f { print > f } /-----END CERTIFICATE-----/ { close(f); f = "" }' "$src"
	for f in "$tmp"/*.crt; do
		[ -e "$f" ] || continue
		if command -v openssl >/dev/null 2>&1 && ! openssl x509 -noout -in "$f" 2>/dev/null; then rm -f "$f"; continue; fi
		n=$((n + 1))
	done
	if [ $n = 0 ]; then rm -rf "$tmp"; return 1; fi
	$CPW_SUDO mkdir -p "$CPW_ROOT/usr/local/share/ca-certificates/cpp-path-workbench"
	$CPW_SUDO cp "$tmp"/*.crt "$CPW_ROOT/usr/local/share/ca-certificates/cpp-path-workbench/"
	$CPW_SUDO update-ca-certificates >/dev/null
	rm -rf "$tmp"
	echo "Trusted $n certificates from Windows (in /usr/local/share/ca-certificates/cpp-path-workbench)."
}

proxy_setup() {
	local proxy="${CPW_PROXY:-}" noproxy cert_note=""
	noproxy="localhost,127.0.0.1,::1${CPW_NO_PROXY:+,$CPW_NO_PROXY}"
	if [ -z "$proxy" ] && [ -z "${CPW_WINDOWS_CERTS:-}" ]; then return 0; fi
	proxy_say "The network: ${proxy:-no proxy}"
	if [ -n "$proxy" ]; then
		local fixed; fixed="$(proxy_fix_localhost "$proxy")"
		if [ "$fixed" != "$proxy" ]; then
			echo "The proxy is on Windows' localhost; from WSL that's $fixed."
			echo "(Its proxy program must accept connections from WSL: for px, start it with --gateway, or set networkingMode=mirrored in .wslconfig.)"
			proxy="$fixed"
		fi
		export http_proxy="$proxy" https_proxy="$proxy" HTTP_PROXY="$proxy" HTTPS_PROXY="$proxy" no_proxy="$noproxy" NO_PROXY="$noproxy"
		# Electron's download reads its own variables
		export ELECTRON_GET_USE_PROXY=1 GLOBAL_AGENT_HTTP_PROXY="$proxy" GLOBAL_AGENT_HTTPS_PROXY="$proxy" GLOBAL_AGENT_NO_PROXY="$noproxy"
		# apt runs as root and doesn't see these: tell it in its own config
		printf 'Acquire::http::Proxy "%s";\nAcquire::https::Proxy "%s";\n' "$proxy" "$proxy" \
			| $CPW_SUDO tee "$CPW_ROOT/etc/apt/apt.conf.d/95cpp-path-workbench-proxy" >/dev/null
		echo "apt: /etc/apt/apt.conf.d/95cpp-path-workbench-proxy"
	fi

	proxy_check; local code=$?
	if [ $code = 60 ] || [ $code = 35 ] || [ $code = 77 ]; then
		echo "HTTPS through the network isn't trusted ($CPW_CHECK_SAID)."
		echo "The proxy probably inspects HTTPS with the company's own certificate, which Windows trusts and Ubuntu doesn't yet."
		if [ -n "${CPW_WINDOWS_CERTS:-}" ] && proxy_trust_windows "$CPW_WINDOWS_CERTS"; then
			proxy_check; code=$?
			cert_note=1
		else
			proxy_warn "No certificates from Windows to add. Ask IT for the company's root certificate (a .crt file), then:"
			echo "    sudo cp company-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates"
		fi
	fi
	case $code in
		0) echo "OK: $CPW_TEST_URL answers${proxy:+ through the proxy}." ;;
		47) proxy_warn "The proxy wants a login (HTTP 407). Linux tools can't use your Windows sign-in for it."
			echo "    Easiest: run px (github.com/genotrance/px) on Windows, which signs in for you, and run the installer with -Proxy http://localhost:3128."
			echo "    Or put the login in the address: -Proxy http://user:password@proxy:8080 (stored in plain text in proxy.env)."
			return 1 ;;
		*) proxy_warn "Still can't reach $CPW_TEST_URL (curl exit $code: $CPW_CHECK_SAID)."
			echo "    Check the proxy address (Windows: Settings → Network → Proxy), or run the installer with -Proxy http://host:port."
			return 1 ;;
	esac

	# What the setup's own steps need, and the app later (Electron's
	# self-fetch, git, npm in its terminal)
	local bundle=/etc/ssl/certs/ca-certificates.crt
	[ -n "$cert_note" ] && export NODE_EXTRA_CA_CERTS="$bundle"
	if command -v npm >/dev/null 2>&1; then
		if [ -n "$proxy" ]; then npm config set proxy "$proxy" >/dev/null && npm config set https-proxy "$proxy" >/dev/null; fi
		[ -n "$cert_note" ] && npm config set cafile "$bundle" >/dev/null
	fi
	if [ -n "$proxy" ] && command -v git >/dev/null 2>&1 && [ -z "$(git config --global --get http.proxy 2>/dev/null)" ]; then git config --global http.proxy "$proxy"; fi
	mkdir -p "$(dirname "$CPW_PROXY_ENV")"
	{
		echo "# Written by C++ Path Workbench's setup (scripts/wsl-proxy.sh). Delete this file to stop using the proxy."
		if [ -n "$proxy" ]; then
			for v in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY GLOBAL_AGENT_HTTP_PROXY GLOBAL_AGENT_HTTPS_PROXY; do printf "export %s='%s'\n" "$v" "$proxy"; done
			printf "export no_proxy='%s' NO_PROXY='%s' GLOBAL_AGENT_NO_PROXY='%s'\n" "$noproxy" "$noproxy" "$noproxy"
			echo "export ELECTRON_GET_USE_PROXY=1"
		fi
		[ -n "$cert_note" ] && echo "export NODE_EXTRA_CA_CERTS='$bundle'"
	} >"$CPW_PROXY_ENV"
	chmod 600 "$CPW_PROXY_ENV"
	local line="[ -f \"$CPW_PROXY_ENV\" ] && . \"$CPW_PROXY_ENV\"  # C++ Path Workbench: the company proxy"
	if ! grep -qF "$CPW_PROXY_ENV" "$HOME/.profile" 2>/dev/null; then printf '\n%s\n' "$line" >>"$HOME/.profile"; fi
	echo "Saved for later (your terminals and the app): $CPW_PROXY_ENV"
}
