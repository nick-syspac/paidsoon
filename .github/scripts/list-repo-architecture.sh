#!/usr/bin/env bash
# list-repo-architecture.sh
# Print a summary of the PaidSoon repository architecture.
# Run from the repository root. Safe, read-only.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "=== PaidSoon Repository Architecture ==="
echo ""

echo "--- Package Info ---"
if [[ -f package.json ]]; then
  echo "  Name:    $(node -e "process.stdout.write(require('./package.json').name || 'unknown')" 2>/dev/null || echo "unknown")"
  echo "  Version: $(node -e "process.stdout.write(require('./package.json').version || 'unknown')" 2>/dev/null || echo "unknown")"
  echo "  Next.js: $(node -e "process.stdout.write(require('./package.json').dependencies?.next || 'not found')" 2>/dev/null || echo "unknown")"
else
  echo "  package.json not found"
fi

echo ""
echo "--- Framework & Router ---"
if [[ -d app ]]; then
  echo "  Router: App Router (app/ directory present)"
elif [[ -d pages ]]; then
  echo "  Router: Pages Router (pages/ directory present)"
else
  echo "  Router: Unknown"
fi

echo ""
echo "--- API Routes ---"
if [[ -d app/api ]]; then
  find app/api -name "route.ts" | sort | while read -r f; do
    echo "  $f"
  done
else
  echo "  app/api/ not found"
fi

echo ""
echo "--- Database ---"
if [[ -f prisma/schema.prisma ]]; then
  echo "  ORM: Prisma (prisma/schema.prisma found)"
  echo "  Models:"
  grep -E "^model " prisma/schema.prisma | awk '{print "    " $2}' || true
else
  echo "  No prisma/schema.prisma found"
fi

echo ""
echo "--- Migrations ---"
if [[ -d prisma/migrations ]]; then
  find prisma/migrations -name "migration.sql" | sort | while read -r f; do
    echo "  $f"
  done
else
  echo "  No prisma/migrations/ directory found"
fi

echo ""
echo "--- RLS Policies ---"
if [[ -f prisma/rls-policies.sql ]]; then
  echo "  Found: prisma/rls-policies.sql"
  echo "  Tables with RLS:"
  grep "ENABLE ROW LEVEL SECURITY" prisma/rls-policies.sql | awk '{print "    " $3}' || true
else
  echo "  prisma/rls-policies.sql not found"
fi

echo ""
echo "--- Auth & Supabase ---"
if [[ -f lib/supabase/server.ts ]]; then
  echo "  Server client: lib/supabase/server.ts"
fi
if [[ -f lib/supabase/client.ts ]]; then
  echo "  Browser client: lib/supabase/client.ts"
fi
if [[ -f proxy.ts ]]; then
  echo "  Proxy (formerly middleware): proxy.ts"
fi

echo ""
echo "--- Email Provider ---"
if grep -qr "resend" package.json 2>/dev/null; then
  RESEND_VER=$(node -e "process.stdout.write(require('./package.json').dependencies?.resend || 'installed')" 2>/dev/null || echo "installed")
  echo "  Resend: $RESEND_VER"
else
  echo "  No email provider detected in package.json"
fi

echo ""
echo "--- Billing ---"
if grep -qr '"stripe"' package.json 2>/dev/null; then
  STRIPE_VER=$(node -e "process.stdout.write(require('./package.json').dependencies?.stripe || 'installed')" 2>/dev/null || echo "installed")
  echo "  Stripe: $STRIPE_VER"
else
  echo "  No Stripe detected in package.json"
fi

echo ""
echo "--- Vercel Config ---"
if [[ -f vercel.json ]]; then
  echo "  Found: vercel.json"
  if command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
with open('vercel.json') as f:
    v = json.load(f)
for c in v.get('crons', []):
    print(f\"  Cron: {c.get('path')} @ {c.get('schedule')}\")
" 2>/dev/null || cat vercel.json
  else
    cat vercel.json
  fi
else
  echo "  vercel.json not found"
fi

echo ""
echo "--- Tests ---"
if [[ -d tests ]]; then
  find tests -name "*.test.ts" | sort | while read -r f; do
    echo "  $f"
  done
else
  echo "  tests/ directory not found"
fi

echo ""
echo "--- Docs ---"
if [[ -d docs ]]; then
  find docs -name "*.md" | sort | while read -r f; do
    echo "  $f"
  done
fi

echo ""
echo "=== End Architecture Summary ==="
