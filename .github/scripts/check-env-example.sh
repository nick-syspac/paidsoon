#!/usr/bin/env bash
# check-env-example.sh
# Check that .env.example (if present) does not contain real secrets, and that
# all env var names referenced in the codebase are documented in docs/runbooks/README.md.
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
echo "=== PaidSoon Env Var Check ==="
echo ""

echo "--- .env Files (should NOT be committed) ---"
for f in .env .env.local .env.production .env.staging .env.development; do
  if [[ -f "$f" ]]; then
    fail "$f is present in the repo root — should be gitignored"
  else
    pass "$f not present"
  fi
done

echo ""
echo "--- .gitignore Coverage ---"
if [[ -f .gitignore ]]; then
  if grep -q "\.env" .gitignore; then
    pass ".gitignore includes .env pattern"
  else
    fail ".gitignore does NOT include .env pattern"
  fi
else
  warn ".gitignore not found"
fi

echo ""
echo "--- .copilotignore Coverage ---"
if [[ -f .copilotignore ]]; then
  if grep -q "\.env" .copilotignore; then
    pass ".copilotignore includes .env pattern"
  else
    warn ".copilotignore does not include .env pattern"
  fi
else
  warn ".copilotignore not found"
fi

echo ""
echo "--- Expected Env Vars Documented in docs/runbooks/README.md ---"
if [[ -f docs/runbooks/README.md ]]; then
  EXPECTED_VARS=(
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    "NEXT_PUBLIC_APP_URL"
    "DATABASE_URL"
    "DIRECT_URL"
    "SUPABASE_SECRET_KEY"
    "RESEND_API_KEY"
    "RESEND_FROM_EMAIL"
    "STRIPE_SECRET_KEY"
    "STRIPE_STARTER_PRICE_ID"
    "STRIPE_BUSINESS_PRICE_ID"
    "STRIPE_SOLO_PRICE_ID"
    "STRIPE_SMALL_BUSINESS_PRICE_ID"
    "STRIPE_CONNECT_CLIENT_ID"
    "STRIPE_BILLING_WEBHOOK_SECRET"
    "STRIPE_CONNECT_WEBHOOK_SECRET"
    "CRON_SECRET"
    "LIVE"
  )

  for var in "${EXPECTED_VARS[@]}"; do
    if grep -q "$var" docs/runbooks/README.md; then
      pass "Documented: $var"
    else
      fail "Not documented in README.md: $var"
    fi
  done
else
  fail "docs/runbooks/README.md not found — env var matrix missing"
fi

echo ""
echo "--- No Server Secrets in NEXT_PUBLIC_ Prefix Check ---"
DANGEROUS_VARS=(
  "NEXT_PUBLIC_STRIPE_SECRET"
  "NEXT_PUBLIC_RESEND_API_KEY"
  "NEXT_PUBLIC_SUPABASE_SECRET"
  "NEXT_PUBLIC_DATABASE_URL"
  "NEXT_PUBLIC_DIRECT_URL"
  "NEXT_PUBLIC_CRON_SECRET"
)

for var in "${DANGEROUS_VARS[@]}"; do
  if grep -r "$var" --include="*.ts" --include="*.tsx" --include="*.js" . 2>/dev/null | grep -v node_modules | grep -q .; then
    fail "Dangerous NEXT_PUBLIC_ prefixed server secret found: $var"
  else
    pass "No $var in codebase"
  fi
done

echo ""
echo "=== Results ==="
echo "  Passed:   $PASS"
echo "  Warnings: $WARN"
echo "  Failed:   $FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Env var check has failures. Review items above."
  exit 1
else
  echo ""
  echo "Env var check passed."
  exit 0
fi
