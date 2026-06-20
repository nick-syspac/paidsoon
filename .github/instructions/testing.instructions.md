---
applyTo: "**/tests/**,**/scripts/**"
---

# Testing Instructions — PaidSoon

## Test Framework

- **Runner:** Node built-in `test` module with `tsx` loader.
- **Run command:** `npm run test` → `node --import tsx --test tests/**/*.test.ts`
- **No Jest or Vitest.** Do not add either without explicit discussion.
- Test files live in `tests/` and follow the `*.test.ts` naming pattern.
- Import test utilities from Node's built-in `node:test` and `node:assert`.

## Existing Tests

| File | What it tests |
|---|---|
| `tests/subscription-plans.test.ts` | Plan catalog, legacy tier migration, feature access flags |
| `tests/dashboard-upsell.test.ts` | Upsell model logic, near-limit detection, tier recommendations |
| `tests/live-mode.test.ts` | Launch gate parsing (`LIVE` env var) |

## Unit Test Expectations

- Test pure business logic in `lib/` — plan checks, upsell logic, email schedule computation.
- All external dependencies (Prisma, Resend, Stripe, Supabase) must be stubbed or mocked.
- Tests must never hit a real database, real email API, or real Stripe API.
- Tests must not import from `lib/db/admin.ts` or `lib/db/withUserContext.ts` directly without mocking.
- Use `import { mock, stub } from "node:test"` for lightweight mocking when needed.
- Tests must be deterministic — no reliance on current date without injecting date.

## API/Route Test Expectations

- API route handlers can be tested by calling the exported handler function directly with a mock `Request`.
- Stub `createClient()` from `lib/supabase/server.ts` to return a fake user.
- Stub `withUserContext` to execute the callback with a mocked Prisma transaction.
- Assert HTTP status codes and response body shapes.
- Do not start a real Next.js dev server for unit tests.

## RLS / Security Tests

- Integration test: `scripts/verify-rls.ts` (`npm run verify-rls`).
- Requires a live Supabase database — not suitable for CI unless a test DB is available.
- Run this script after every migration or RLS policy change.
- It seeds two users, verifies cross-user queries return zero rows for each user context.

## Email Automation Tests

- Never send real emails from tests.
- Stub `lib/email/send.ts` → `sendFollowUpEmail` with a no-op mock.
- Test the scheduling logic in `lib/email/schedule.ts` with injected dates.
- Test the catch-up scan logic in `lib/email/catchup.ts` by mocking `prismaAdmin` and the provider.
- Assert idempotency: calling the scan twice with the same invoice data must not create duplicate rows.

## Billing Tests

- Test `hasPlanFeature(tier, feature)` from `lib/billing.ts` for all tier/feature combinations.
- Test `getInvoiceLimitForTier` returns correct limits.
- Test Stripe webhook handlers by calling the exported handler with a mock `Request` that includes a valid (mocked) signature.
- Never call the real Stripe API from tests.

## Test Conventions

```ts
import { test, describe } from "node:test"
import assert from "node:assert/strict"

describe("MyModule", () => {
  test("does the expected thing", () => {
    // arrange
    // act
    // assert
    assert.strictEqual(actual, expected)
  })
})
```

- Prefer `assert.strictEqual` and `assert.deepStrictEqual` over loose equality.
- Test one behaviour per `test` block.
- Descriptive test names: `"returns 403 when user lacks feature"` not `"test1"`.

## What Must Have Tests

After implementing any of the following, add tests in `tests/`:
- New subscription tier or feature flag
- New upsell condition
- New email schedule logic
- New billing entitlement check
- New invoice lifecycle state transition
