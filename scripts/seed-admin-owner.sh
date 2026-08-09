#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBKEY_PATH="${HOME}/.ssh/paidsoon_admin_touchid.pub"

if [[ ! -f "$PUBKEY_PATH" ]]; then
  echo "Missing public key: $PUBKEY_PATH" >&2
  exit 1
fi

export PLATFORM_OWNER_EMAIL="${PLATFORM_OWNER_EMAIL:-owner@coastline-demo.test}"
export ADMIN_SSH_PUBLIC_KEY="$(cat "$PUBKEY_PATH")"
export ADMIN_DEVICE_LABEL="${ADMIN_DEVICE_LABEL:-MacBook Touch ID}"

cd "$PROJECT_ROOT"
node --import tsx scripts/seed-admin-owner.ts