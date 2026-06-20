#!/usr/bin/env bash
# check-docs-references.sh
# Verify that documentation references match actual codebase files and paths.
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
echo "=== PaidSoon Docs References Check ==="
echo ""

echo "--- Core Doc Files ---"
check_doc() {
  local f="$1"
  [[ -f "$f" ]] && pass "$f exists" || fail "$f missing"
}

check_doc "docs/DDD.md"
check_doc "docs/HLD.md"
check_doc "docs/runbooks/README.md"
check_doc "docs/runbooks/resend.md"
check_doc "docs/runbooks/supabase.md"
check_doc "docs/runbooks/stripe.md"
check_doc "docs/runbooks/vercel.md"

echo ""
echo "--- Copilot Doc Files ---"
check_doc "docs/github-copilot-configuration.md"
check_doc "docs/github-copilot-readiness.md"
check_doc "docs/github-copilot-gap-analysis.md"

echo ""
echo "--- DDD.md API Routes vs Actual Files ---"
if [[ -f docs/DDD.md ]]; then
  echo "  Checking actual route files exist..."
  EXPECTED_ROUTES=(
    "app/api/billing/checkout/route.ts"
    "app/api/billing/portal/route.ts"
    "app/api/cron/send-emails/route.ts"
    "app/api/settings/email/route.ts"
    "app/api/settings/schedule/route.ts"
    "app/api/stripe/connect/authorize/route.ts"
    "app/api/stripe/connect/callback/route.ts"
    "app/api/stripe/connect/disconnect/route.ts"
    "app/api/webhooks/stripe-billing/route.ts"
    "app/api/webhooks/stripe-connect/route.ts"
  )
  for route in "${EXPECTED_ROUTES[@]}"; do
    if [[ -f "$route" ]]; then
      pass "Route exists: $route"
    else
      fail "Route referenced in docs but missing: $route"
    fi
  done
else
  warn "docs/DDD.md not found — cannot check route references"
fi

echo ""
echo "--- Key Library Files Referenced in Docs ---"
KEY_LIBS=(
  "lib/db/withUserContext.ts"
  "lib/db/admin.ts"
  "lib/supabase/server.ts"
  "lib/supabase/client.ts"
  "lib/email/send.ts"
  "lib/email/templates.ts"
  "lib/email/schedule.ts"
  "lib/email/catchup.ts"
  "lib/billing.ts"
  "lib/subscriptionPlans.ts"
  "lib/liveMode.ts"
  "lib/providers/types.ts"
  "lib/providers/stripe.ts"
)

for lib in "${KEY_LIBS[@]}"; do
  if [[ -f "$lib" ]]; then
    pass "Library file exists: $lib"
  else
    fail "Library file missing: $lib"
  fi
done

echo ""
echo "--- Scaffolded Features Labelled in DDD.md ---"
if [[ -f docs/DDD.md ]]; then
  SCAFFOLDED_TERMS=("AI rewrite\|ai.*rewrite\|ai rewrite" "custom.*template\|templates" "team.*invite\|invite")
  SCAFFOLDED_LABELS=("scaffolded\|Scaffolded\|planned\|Planned\|not.*implemented\|Not.*implemented")
  
  # Check if DDD.md mentions scaffolded status
  if grep -qi "scaffold\|not fully implemented\|planned" docs/DDD.md; then
    pass "DDD.md contains scaffolded/planned feature labels"
  else
    warn "DDD.md may not label scaffolded features clearly (AI rewrite, templates, team invites)"
  fi
fi

echo ""
echo "=== Results ==="
echo "  Passed:   $PASS"
echo "  Warnings: $WARN"
echo "  Failed:   $FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Docs reference check has failures. Update documentation to match the codebase."
  exit 1
else
  echo ""
  echo "Docs reference check passed."
  exit 0
fi
