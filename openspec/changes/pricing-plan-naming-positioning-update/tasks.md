## 1. Catalog and messaging

- [x] 1.1 Update the canonical plan catalog so the public label for the `solo` tier is `Business Control` while preserving internal compatibility mappings.
- [x] 1.2 Refresh plan positioning copy to match the required Essentials, Business Control, Small Business, and Business Pro story.
- [x] 1.3 Confirm pricing order and Small Business popularity badge remain aligned with the catalog.

## 2. Pricing and onboarding surfaces

- [x] 2.1 Update pricing page metadata, plan cards, and comparison copy to use the renamed public label and required wording.
- [x] 2.2 Update onboarding and plan-selection flows to surface `Business Control` without changing the underlying tier-selection compatibility behavior.
- [x] 2.3 Update account, dashboard, and settings surfaces that announce the current plan title or upgrade prompts.

## 3. Validation and compatibility

- [x] 3.1 Update tests to assert internal compatibility while rendering `Business Control` to customers.
- [x] 3.2 Verify no customer-facing pricing or settings surface still shows `Solo` and confirm the price remains A$29/month.
- [x] 3.3 Run the relevant test, lint, type-check, and build verification commands and record the results.

## Validation snapshot

- `node --experimental-test-module-mocks --import tsx --test tests/subscription-plans.test.ts`: pass (17/17)
- `npm run lint`: pass
- `npx tsc --noEmit -p tsconfig.json`: fail (pre-existing baseline errors outside this change scope, including BigInt target errors in `lib/depositGuard/calculations.ts` and Node test mock typing errors in multiple `tests/deposit-guard-*.test.ts` files)
- `npm run build`: fail during type check due to the same pre-existing BigInt target errors in `lib/depositGuard/calculations.ts`
