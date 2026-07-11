#!/usr/bin/env bash
# check-supabase-config.sh
# Verify Supabase configuration files and patterns in PaidSoon.
# Run from the repository root. Safe, read-only.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
WARN=0

pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  WARN  $1"; WARN=$((WARN + 1)); }

echo ""
echo "=== PaidSoon Supabase Config Check ==="
echo ""

echo "--- Client Files ---"
[[ -f lib/supabase/server.ts ]] && pass "lib/supabase/server.ts exists" || fail "lib/supabase/server.ts missing"
[[ -f lib/supabase/client.ts ]] && pass "lib/supabase/client.ts exists" || fail "lib/supabase/client.ts missing"

echo ""
echo "--- Database Access Pattern ---"
[[ -f lib/db/withUserContext.ts ]] && pass "lib/db/withUserContext.ts exists (user context DB)" || fail "lib/db/withUserContext.ts missing"
[[ -f lib/db/admin.ts ]] && pass "lib/db/admin.ts exists (prismaAdmin)" || fail "lib/db/admin.ts missing"

echo ""
echo "--- Schema & Migrations ---"
[[ -f prisma/schema.prisma ]] && pass "prisma/schema.prisma exists" || fail "prisma/schema.prisma missing"
[[ -f prisma/rls-policies.sql ]] && pass "prisma/rls-policies.sql exists" || fail "prisma/rls-policies.sql missing"
[[ -d prisma/migrations ]] && pass "prisma/migrations/ directory exists" || fail "prisma/migrations/ missing"

echo ""
echo "--- RLS Policy Coverage ---"
if [[ -f prisma/rls-policies.sql ]]; then
  if grep -q "ENABLE ROW LEVEL SECURITY" prisma/rls-policies.sql; then
    pass "RLS enabled on at least one table"
    
    # Check each expected table (allow both quoted and unquoted table names)
    for table in "user_profiles" "invoice_connections" "schedules" "email_settings" "tracked_invoices" "email_logs"; do
      if grep -q "$table" prisma/rls-policies.sql; then
        pass "RLS policy references table: $table"
      else
        warn "RLS policy may not cover table: $table"
      fi
    done
  else
    fail "No ENABLE ROW LEVEL SECURITY found in rls-policies.sql"
  fi
fi

echo ""
echo "--- Auth Patterns ---"
if [[ -f proxy.ts ]]; then
  if grep -q "getUser" proxy.ts; then
    pass "proxy.ts uses getUser() pattern"
  else
    warn "proxy.ts — could not confirm getUser() usage"
  fi
fi

echo ""
echo "--- Server Client Usage ---"
# Check that server.ts is NOT imported in use-client files
CLIENT_MISUSE=$(grep -rl "from.*supabase/server" components/ 2>/dev/null | xargs grep -l '"use client"' 2>/dev/null || true)
if [[ -n "$CLIENT_MISUSE" ]]; then
  fail "Server Supabase client imported in 'use client' component: $CLIENT_MISUSE"
else
  pass "No 'use client' components import lib/supabase/server"
fi

echo ""
echo "--- RLS Integration Test ---"
[[ -f scripts/verify-rls.ts ]] && pass "scripts/verify-rls.ts exists (npm run verify-rls)" || warn "scripts/verify-rls.ts not found — RLS integration test missing"

echo ""
echo "--- Prisma Config ---"
[[ -f prisma.config.ts ]] && pass "prisma.config.ts exists" || warn "prisma.config.ts not found"

echo ""
echo "=== Results ==="
echo "  Passed:   $PASS"
echo "  Warnings: $WARN"
echo "  Failed:   $FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Supabase configuration has failures. Review items above."
  exit 1
else
  echo ""
  echo "Supabase configuration check passed."
  exit 0
fi
