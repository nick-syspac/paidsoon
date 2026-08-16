#!/usr/bin/env bash
# reset-myob-connection.sh
#
# Interactive wrapper around `npm run reset:myob-connection` for support/admin
# use. See docs/runbooks/myob.md (section 6) for full context on what soft
# vs. hard reset does.
#
# Usage:
#   scripts/reset-myob-connection.sh --email <email> [--hard-delete]
#   scripts/reset-myob-connection.sh --user-id <id> [--hard-delete]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

usage() {
  cat <<'EOF'
Usage:
  scripts/reset-myob-connection.sh --email <email> [--hard-delete]
  scripts/reset-myob-connection.sh --user-id <id> [--hard-delete]

Options:
  --email <email>   Supabase auth email of the user whose MYOB connection to reset.
  --user-id <id>    Supabase auth user ID (alternative to --email).
  --hard-delete     Fully delete the connection and its sync history instead of
                     soft-disconnecting. Destructive — asks for confirmation.
  -h, --help        Show this help text.

Requires SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD (loaded from .env.local
by the underlying script). --email additionally requires SUPABASE_SECRET_KEY.

See docs/runbooks/myob.md (section 6) for details on what each mode does.
EOF
}

EMAIL=""
USER_ID_ARG=""
HARD_DELETE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      EMAIL="${2:-}"
      shift 2
      ;;
    --user-id)
      USER_ID_ARG="${2:-}"
      shift 2
      ;;
    --hard-delete)
      HARD_DELETE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$EMAIL" && -z "$USER_ID_ARG" ]]; then
  echo "Error: one of --email or --user-id is required." >&2
  usage
  exit 1
fi

if [[ -n "$EMAIL" && -n "$USER_ID_ARG" ]]; then
  echo "Error: pass only one of --email or --user-id, not both." >&2
  exit 1
fi

if [[ "$HARD_DELETE" == "true" ]]; then
  echo "WARNING: --hard-delete permanently removes the MYOB AccountingConnection row"
  echo "and its sync history (AccountingSyncRun, ProviderInvoiceMapping,"
  echo "ProviderContactMapping). This cannot be undone. The user will need to fully"
  echo "reconnect via OAuth afterwards."
  echo ""
  read -r -p "Type 'yes' to confirm hard delete: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

export HARD_DELETE
if [[ -n "$EMAIL" ]]; then
  export USER_EMAIL="$EMAIL"
  unset -v USER_ID || true
else
  export USER_ID="$USER_ID_ARG"
  unset -v USER_EMAIL || true
fi

MODE_LABEL="soft disconnect"
if [[ "$HARD_DELETE" == "true" ]]; then
  MODE_LABEL="hard delete"
fi

echo ""
echo "Running reset-myob-connection (mode: $MODE_LABEL)..."
npm run reset:myob-connection
