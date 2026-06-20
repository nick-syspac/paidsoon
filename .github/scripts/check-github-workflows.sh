#!/usr/bin/env bash
# check-github-workflows.sh
# Check for GitHub Actions workflow files in PaidSoon.
# Run from the repository root. Safe, read-only.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PASS=0
WARN=0

pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
warn() { echo "  WARN  $1"; WARN=$((WARN + 1)); }

echo ""
echo "=== PaidSoon GitHub Workflows Check ==="
echo ""

echo "--- Workflow Directory ---"
if [[ -d .github/workflows ]]; then
  WORKFLOW_COUNT=$(find .github/workflows -name "*.yml" -o -name "*.yaml" 2>/dev/null | wc -l)
  if [[ $WORKFLOW_COUNT -gt 0 ]]; then
    pass ".github/workflows/ exists with $WORKFLOW_COUNT workflow file(s)"
    echo ""
    echo "--- Workflow Files ---"
    find .github/workflows -name "*.yml" -o -name "*.yaml" 2>/dev/null | sort | while read -r f; do
      echo "  Found: $f"
    done
  else
    warn ".github/workflows/ exists but no workflow files found"
  fi
else
  warn ".github/workflows/ directory not found — no CI/CD pipelines configured"
  echo ""
  echo "  Note: PaidSoon currently deploys via Vercel git integration (no GitHub Actions)."
  echo "  Suggested future workflows:"
  echo "    - .github/workflows/test.yml — run 'npm run test' on push/PR"
  echo "    - .github/workflows/lint.yml — run 'npm run lint' on push/PR"
  echo "    - .github/workflows/check-env-drift.yml — verify env var documentation"
fi

echo ""
echo "--- OpenSpec Prompts (present) ---"
if [[ -d .github/prompts ]]; then
  find .github/prompts -name "*.prompt.md" | sort | while read -r f; do
    echo "  Found: $f"
  done
fi

echo ""
echo "=== Results ==="
echo "  Passed:   $PASS"
echo "  Warnings: $WARN"

if [[ $WARN -gt 0 ]]; then
  echo ""
  echo "No critical failures, but some items need attention."
fi

echo ""
echo "Done."
exit 0
