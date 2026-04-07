#!/usr/bin/env bash
set -euo pipefail

PACKAGE_SPEC="${MAILCLAW_INSTALL_SOURCE:-mailclaws}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "--local" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "usage: ./install.sh [--local <tarball>]" >&2
    exit 1
  fi
  PACKAGE_SPEC="$2"
fi

if [[ "$PACKAGE_SPEC" == "mailclaws" ]]; then
  LOCAL_TARBALL="$(find "$SCRIPT_DIR/output/release/npm" -maxdepth 1 -type f -name 'mailclaws-*.tgz' 2>/dev/null | sort | tail -n 1 || true)"
  if [[ -n "${LOCAL_TARBALL:-}" ]]; then
    PACKAGE_SPEC="$LOCAL_TARBALL"
  fi
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$2" >&2
    exit 1
  fi
}

require_command node "MailClaws requires Node.js 22+. Install Node first, then rerun this installer."

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ -z "$NODE_MAJOR" || "$NODE_MAJOR" -lt 22 ]]; then
  echo "MailClaws requires Node.js 22+." >&2
  echo "Current runtime: $(node -p 'process.version')" >&2
  exit 1
fi

install_with_npm() {
  require_command npm "npm is required for the default MailClaws installer path."
  npm install -g "$PACKAGE_SPEC"
}

install_with_pnpm() {
  require_command pnpm "pnpm is required for the pnpm MailClaws installer path."
  pnpm setup >/dev/null 2>&1 || true
  if [[ "$PACKAGE_SPEC" == /* || "$PACKAGE_SPEC" == ./* || "$PACKAGE_SPEC" == ../* ]]; then
    pnpm add -g "file://$PACKAGE_SPEC"
  else
    pnpm add -g "$PACKAGE_SPEC"
  fi
}

INSTALLER="${MAILCLAW_INSTALLER:-npm}"
case "$INSTALLER" in
  npm)
    install_with_npm
    ;;
  pnpm)
    install_with_pnpm
    ;;
  *)
    echo "Unsupported MAILCLAW_INSTALLER: $INSTALLER" >&2
    exit 1
    ;;
esac

cat <<'EOF'

MailClaws installed.

Quick start:
  mailclaws
  mailclaws onboard you@example.com
  mailclaws login
  mailclaws gateway
  mailclaws dashboard

Workbench:
  OpenClaw/Gateway first via `mailclaws gateway`
  Direct Mail tab fallback: http://127.0.0.1:3000/workbench/mail
EOF
