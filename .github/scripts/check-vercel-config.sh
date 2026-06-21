#!/usr/bin/env bash
# check-vercel-config.sh
# Verify Vercel deployment configuration for PaidSoon.
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
echo "=== PaidSoon Vercel Config Check ==="
echo ""

echo "--- Config Files ---"
[[ -f vercel.json ]] && pass "vercel.json exists" || fail "vercel.json missing"
[[ -f next.config.ts ]] && pass "next.config.ts exists" || fail "next.config.ts missing"

echo ""
echo "--- Build Config ---"
if [[ -f package.json ]]; then
  BUILD_CMD=$(node -e "process.stdout.write(require('./package.json').scripts?.build || '')" 2>/dev/null || echo "")
  if echo "$BUILD_CMD" | grep -q "prisma generate"; then
    pass "Build script includes 'prisma generate': $BUILD_CMD"
  else
    fail "Build script does NOT include 'prisma generate': '$BUILD_CMD'"
  fi
  if echo "$BUILD_CMD" | grep -q "next build"; then
    pass "Build script includes 'next build'"
  else
    fail "Build script does NOT include 'next build'"
  fi
fi

echo ""
echo "--- next.config.ts ---"
if [[ -f next.config.ts ]]; then
  if grep -q "serverExternalPackages" next.config.ts; then
    if grep -q "@prisma/client" next.config.ts; then
      pass "serverExternalPackages includes @prisma/client"
    else
      fail "serverExternalPackages missing @prisma/client"
    fi
    if grep -q "@prisma/adapter-pg" next.config.ts; then
      pass "serverExternalPackages includes @prisma/adapter-pg"
    else
      fail "serverExternalPackages missing @prisma/adapter-pg"
    fi
  else
    fail "serverExternalPackages not found in next.config.ts"
  fi
fi

echo ""
echo "--- Vercel Cron Config ---"
if [[ -f vercel.json ]]; then
  if grep -q '"crons"' vercel.json; then
    pass "vercel.json has crons configuration"
    if grep -q '"/api/cron/send-emails"' vercel.json; then
      pass "Cron path /api/cron/send-emails configured"
    else
      fail "Cron path /api/cron/send-emails not found in vercel.json"
    fi
  else
    warn "No crons configuration in vercel.json"
  fi
fi

echo ""
echo "--- Cron Route Exists ---"
if [[ -f app/api/cron/send-emails/route.ts ]]; then
  pass "app/api/cron/send-emails/route.ts exists"
  if grep -q "CRON_SECRET" app/api/cron/send-emails/route.ts; then
    pass "Cron route references CRON_SECRET (auth check present)"
  else
    fail "CRON_SECRET not referenced in cron route — authentication may be missing"
  fi
else
  fail "app/api/cron/send-emails/route.ts missing"
fi

echo ""
echo "--- Edge Runtime Check ---"
# Prisma cannot run on Edge runtime — check no Prisma-using routes set edge runtime
EDGE_ROUTES=$(grep -rl 'runtime.*=.*"edge"\|runtime.*=.*'"'"'edge'"'"'' app/api/ 2>/dev/null || true)
if [[ -n "$EDGE_ROUTES" ]]; then
  warn "Edge runtime set in API routes (Prisma incompatible): $EDGE_ROUTES"
else
  pass "No Edge runtime set in API routes"
fi

echo ""
echo "--- Live Mode Config ---"
[[ -f lib/liveMode.ts ]] && pass "lib/liveMode.ts exists" || warn "lib/liveMode.ts not found"
if [[ -f middleware.ts ]]; then
  if grep -q "isLiveMode\|LIVE\|liveMode" middleware.ts; then
    pass "middleware.ts references LIVE mode gate"
  else
    warn "LIVE mode gate not found in middleware.ts"
  fi
fi

echo ""
echo "--- Documentation ---"
[[ -f docs/runbooks/README.md ]] && pass "docs/runbooks/README.md exists (env var matrix)" || fail "docs/runbooks/README.md missing"
[[ -f docs/runbooks/vercel.md ]] && pass "docs/runbooks/vercel.md exists" || warn "docs/runbooks/vercel.md missing"

echo ""
echo "=== Results ==="
echo "  Passed:   $PASS"
echo "  Warnings: $WARN"
echo "  Failed:   $FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Vercel config check has failures. Review items above."
  exit 1
else
  echo ""
  echo "Vercel config check passed."
  exit 0
fi
