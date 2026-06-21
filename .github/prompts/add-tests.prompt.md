---
mode: agent
description: Add tests for new or existing PaidSoon business logic.
---

# Add Tests — PaidSoon

## Role
You are a senior engineer writing tests for PaidSoon business logic.

## Goal
Write unit tests for a specific module or feature using Node's built-in `test` module and `tsx` loader.

## PaidSoon Context
Test runner: `node --import tsx --test tests/**/*.test.ts`. No Jest or Vitest. Tests must not call real DB, Stripe, or Resend APIs.

## Files to Inspect Before Writing Tests
- `tests/subscription-plans.test.ts` — plan feature tests (reference pattern)
- `tests/dashboard-upsell.test.ts` — upsell logic tests (reference pattern)
- `tests/live-mode.test.ts` — simple pure-function tests
- `lib/subscriptionPlans.ts` — functions to test
- `lib/billing.ts` — functions to test
- `lib/email/schedule.ts` — schedule computation to test
- `lib/dashboardUpsell.ts` — upsell logic to test

## Test Pattern

```ts
import { test, describe } from "node:test"
import assert from "node:assert/strict"

describe("ModuleName", () => {
  describe("functionName", () => {
    test("returns expected result for valid input", () => {
      const result = functionUnderTest(inputData)
      assert.strictEqual(result, expectedValue)
    })

    test("returns false when feature not in tier", () => {
      const result = hasPlanFeature("starter", "own_email_address")
      assert.strictEqual(result, false)
    })
  })
})
```

## What Needs Tests

### Always test these after changes:
- New feature flags in `lib/subscriptionPlans.ts` → test in `tests/subscription-plans.test.ts`
- Upsell logic changes in `lib/dashboardUpsell.ts` → test in `tests/dashboard-upsell.test.ts`
- Email schedule computation in `lib/email/schedule.ts` → test with injected dates
- Invoice status state transitions → test the valid/invalid transitions

### Mocking Pattern (for Prisma)
```ts
// Stub module-level singleton
import { test, mock } from "node:test"
// Or pass mock implementations as function arguments (preferred for testability)
function functionToTest(db: { findFirst: (args: unknown) => Promise<unknown> }) { ... }
```

### Date Injection
Functions that use `new Date()` should accept an optional `now?: Date` parameter:
```ts
function computeNextEmailAt(dueDate: Date, stage: number, schedule: Schedule, now = new Date()): Date
```

## Rules
- Never touch real DB, Stripe, or Resend in unit tests
- Use `assert.strictEqual` for primitives, `assert.deepStrictEqual` for objects
- One assertion per test block when possible
- Descriptive test names: describe the behaviour, not the implementation
- Tests must be deterministic — no reliance on `Date.now()` without injection

## Run Tests
```bash
npm run test
```

## Expected Output
1. New test file `tests/<module>.test.ts` OR additions to existing test file
2. All tests should pass on `npm run test`

## Acceptance Criteria
- All new tests pass: `npm run test`
- Tests cover: happy path, edge cases, and error conditions
- No real API calls in any test
- Descriptive test names
