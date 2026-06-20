# Skill: Testing Strategy — PaidSoon

## When to Use This Skill
Use when writing, reviewing, or debugging tests for PaidSoon business logic.

## Status
Confirmed implemented (Node built-in `test` module with `tsx` loader).

## Inputs Required
- Module or feature to test
- Whether unit test, API test, or RLS integration test

## Files to Inspect
- `tests/subscription-plans.test.ts` — feature flag test pattern
- `tests/dashboard-upsell.test.ts` — upsell logic pattern
- `tests/live-mode.test.ts` — pure function pattern
- `package.json` — test script
- `scripts/verify-rls.ts` — RLS integration test

## Test Framework

```ts
import { test, describe } from "node:test"
import assert from "node:assert/strict"
```

Run: `npm run test`

## Test File Organisation

```
tests/
  subscription-plans.test.ts   — Plan catalog, features, legacy mapping
  dashboard-upsell.test.ts     — Upsell model, near-limit detection
  live-mode.test.ts            — LIVE env var parsing
  <new-feature>.test.ts        — One file per feature module
```

## Patterns

### Pure Function Test
```ts
describe("hasPlanFeature", () => {
  test("starter does not have own_email_address", () => {
    assert.strictEqual(hasPlanFeature("starter", "own_email_address"), false)
  })
  test("solo has own_email_address", () => {
    assert.strictEqual(hasPlanFeature("solo", "own_email_address"), true)
  })
})
```

### Date Injection Pattern
```ts
// Function accepts optional now parameter
function computeNextEmailAt(dueDate: Date, stage: number, schedule: Schedule, now = new Date()) {
  // use now instead of new Date()
}

// Test with fixed date
test("computes 10 days after due for stage 2", () => {
  const dueDate = new Date("2026-01-01")
  const result = computeNextEmailAt(dueDate, 2, defaultSchedule, new Date("2026-01-01"))
  assert.strictEqual(result.toISOString(), "2026-01-11T00:00:00.000Z")
})
```

### Mocking External Dependencies
Use function parameter injection over module mocks where possible:
```ts
// Instead of: import { sendFollowUpEmail } from "@/lib/email/send"
// Pass as parameter:
async function processCronBatch(
  invoices: Invoice[],
  sendEmail: typeof sendFollowUpEmail = sendFollowUpEmail
)
```

## What Must Have Tests

| Module | Test file | What to test |
|---|---|---|
| `lib/subscriptionPlans.ts` | `subscription-plans.test.ts` | All feature flags per tier |
| `lib/billing.ts` | Add to subscription-plans | `hasPlanFeature`, limits |
| `lib/email/schedule.ts` | New: `email-schedule.test.ts` | `computeNextEmailAt` per stage |
| `lib/dashboardUpsell.ts` | `dashboard-upsell.test.ts` | Upsell triggers, near-limit |
| `lib/liveMode.ts` | `live-mode.test.ts` | Env var parsing |

## Rules to Follow
- Never call real DB, Stripe, or Resend from tests
- Use `assert.strictEqual` (not `==`)
- One behaviour per `test` block
- Descriptive test names
- Inject dates — never rely on `Date.now()` directly

## Common Mistakes to Avoid
- Importing `lib/db/withUserContext` without mocking (hits real DB)
- Using `beforeEach` to reset global state (use function scope)
- Non-deterministic tests (random data, real dates)
- Test files that call real external APIs

## Output Format
- Test file at `tests/<module>.test.ts`
- All tests deterministic and isolated
- `npm run test` passes

## Acceptance Checklist
- [ ] No real API/DB calls in unit tests
- [ ] Tests pass: `npm run test`
- [ ] Descriptive test names
- [ ] Both happy path and error cases covered
- [ ] Dates injected (not `new Date()` inside test)
