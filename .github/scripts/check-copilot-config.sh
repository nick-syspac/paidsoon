#!/usr/bin/env bash
# check-copilot-config.sh
# Verify that all required GitHub Copilot configuration files exist in PaidSoon.
# Run from the repository root.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0

check_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    echo "  PASS  $file"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $file (missing)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== PaidSoon Copilot Config Check ==="
echo ""

echo "--- Global Instructions ---"
check_file ".github/copilot-instructions.md"

echo ""
echo "--- Instruction Files ---"
check_file ".github/instructions/frontend.instructions.md"
check_file ".github/instructions/backend-api.instructions.md"
check_file ".github/instructions/supabase.instructions.md"
check_file ".github/instructions/vercel.instructions.md"
check_file ".github/instructions/testing.instructions.md"
check_file ".github/instructions/security.instructions.md"
check_file ".github/instructions/email-automation.instructions.md"
check_file ".github/instructions/billing.instructions.md"
check_file ".github/instructions/docs.instructions.md"

echo ""
echo "--- Prompt Files ---"
check_file ".github/prompts/audit-codebase.prompt.md"
check_file ".github/prompts/audit-supabase-rls.prompt.md"
check_file ".github/prompts/audit-vercel-deployment.prompt.md"
check_file ".github/prompts/build-feature.prompt.md"
check_file ".github/prompts/build-invoice-reminder-flow.prompt.md"
check_file ".github/prompts/build-promise-to-pay-flow.prompt.md"
check_file ".github/prompts/build-dispute-pause-flow.prompt.md"
check_file ".github/prompts/build-weekly-debtor-summary.prompt.md"
check_file ".github/prompts/build-myob-integration.prompt.md"
check_file ".github/prompts/build-csv-import.prompt.md"
check_file ".github/prompts/add-api-route.prompt.md"
check_file ".github/prompts/add-supabase-table.prompt.md"
check_file ".github/prompts/add-rls-policy.prompt.md"
check_file ".github/prompts/add-nextjs-page.prompt.md"
check_file ".github/prompts/add-dashboard-widget.prompt.md"
check_file ".github/prompts/add-email-template.prompt.md"
check_file ".github/prompts/add-stripe-billing.prompt.md"
check_file ".github/prompts/add-tests.prompt.md"
check_file ".github/prompts/fix-frontend-issue.prompt.md"
check_file ".github/prompts/fix-api-issue.prompt.md"
check_file ".github/prompts/fix-supabase-issue.prompt.md"
check_file ".github/prompts/security-review.prompt.md"
check_file ".github/prompts/production-readiness-review.prompt.md"
check_file ".github/prompts/prepare-release.prompt.md"
check_file ".github/prompts/update-docs.prompt.md"

echo ""
echo "--- Skill Files ---"
check_file ".github/skills/nextjs-app-router.skill.md"
check_file ".github/skills/supabase-auth.skill.md"
check_file ".github/skills/supabase-rls.skill.md"
check_file ".github/skills/supabase-migrations.skill.md"
check_file ".github/skills/vercel-deployment.skill.md"
check_file ".github/skills/invoice-domain.skill.md"
check_file ".github/skills/email-reminders.skill.md"
check_file ".github/skills/csv-import.skill.md"
check_file ".github/skills/myob-integration.skill.md"
check_file ".github/skills/stripe-billing.skill.md"
check_file ".github/skills/testing-strategy.skill.md"
check_file ".github/skills/security-review.skill.md"
check_file ".github/skills/customer-data-protection.skill.md"
check_file ".github/skills/production-readiness.skill.md"
check_file ".github/skills/documentation-maintenance.skill.md"

echo ""
echo "--- Other Config Files ---"
check_file ".copilotignore"
check_file "docs/github-copilot-configuration.md"
check_file "docs/github-copilot-readiness.md"
check_file "docs/github-copilot-gap-analysis.md"

echo ""
echo "=== Results ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Some Copilot config files are missing. Run the configuration builder to create them."
  exit 1
else
  echo ""
  echo "All Copilot config files present."
  exit 0
fi
